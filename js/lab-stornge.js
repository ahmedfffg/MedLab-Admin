/* ============================================================
   LAB STORAGE - نظام تخزين محلي + مزامنة + حفظ تلقائي
   الإصدار المُصلح - v3.1 - يدعم uploaded_files + tubes
   ============================================================ */
(function () {
    'use strict';

    const DB_NAME = 'MedLabAdminDB';
    const DB_VERSION = 3;
    const STORES = {
        patients: 'lab_patients',
        queue: 'sync_queue'
    };

    /* ============================================================
       1. IndexedDB - قاعدة بيانات محلية
    ============================================================ */
    class LocalDB {
        constructor() {
            this.db = null;
            this.initPromise = null;
        }

        init() {
            if (this.initPromise) return this.initPromise;

            this.initPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    if (!db.objectStoreNames.contains(STORES.patients)) {
                        const store = db.createObjectStore(STORES.patients, { keyPath: 'local_id' });
                        store.createIndex('visit_date', 'visit_date', { unique: false });
                        store.createIndex('phone', 'phone', { unique: false });
                        store.createIndex('full_name', 'full_name', { unique: false });
                        store.createIndex('created_at', 'created_at', { unique: false });
                    }

                    if (!db.objectStoreNames.contains(STORES.queue)) {
                        const queue = db.createObjectStore(STORES.queue, {
                            keyPath: 'queue_id',
                            autoIncrement: true
                        });
                        queue.createIndex('status', 'status', { unique: false });
                        queue.createIndex('timestamp', 'timestamp', { unique: false });
                        queue.createIndex('patient_local_id', 'patient_local_id', { unique: false });
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    console.log('✅ IndexedDB opened:', DB_NAME, 'v' + DB_VERSION);
                    resolve(this.db);
                };

                request.onerror = () => {
                    console.error('❌ IndexedDB error:', request.error);
                    reject(request.error);
                };
            });

            return this.initPromise;
        }

        async getAll(storeName) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readonly');
                const request = tx.objectStore(storeName).getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        }

        async getById(storeName, id) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readonly');
                const request = tx.objectStore(storeName).get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async getByIndex(storeName, indexName, value) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readonly');
                const index = tx.objectStore(storeName).index(indexName);
                const request = index.getAll(value);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        }

        async put(storeName, data) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readwrite');
                const request = tx.objectStore(storeName).put(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async add(storeName, data) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readwrite');
                const request = tx.objectStore(storeName).add(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async delete(storeName, id) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readwrite');
                const request = tx.objectStore(storeName).delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        async clear(storeName) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readwrite');
                const request = tx.objectStore(storeName).clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }

    /* ============================================================
       2. Lab Storage Manager
    ============================================================ */
    class LabStorage {
        constructor() {
            this.db = new LocalDB();
            this.isOnline = navigator.onLine;
            this.syncing = false;
            this.listeners = [];
            this._initialized = false;
        }

        async init() {
            if (this._initialized) return this;
            try {
                await this.db.init();
                this.setupListeners();
                this._initialized = true;
                console.log('✅ LabStorage initialized');
                return this;
            } catch (error) {
                console.error('❌ LabStorage init failed:', error);
                throw error;
            }
        }

        setupListeners() {
            window.addEventListener('online', () => {
                this.isOnline = true;
                console.log('🌐 Online');
                this.notify('online');
                this.processQueue();
            });

            window.addEventListener('offline', () => {
                this.isOnline = false;
                console.log('📴 Offline');
                this.notify('offline');
            });
        }

        subscribe(callback) {
            this.listeners.push(callback);
            return () => {
                this.listeners = this.listeners.filter(cb => cb !== callback);
            };
        }

        notify(event, data = null) {
            this.listeners.forEach(cb => {
                try { cb(event, data); } catch (e) { console.error('Listener error:', e); }
            });
        }

        /* ============================================================
           حفظ مريض جديد
        ============================================================ */
        async savePatient(patientData) {
            await this.init();

            const localId = 'lab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            const patient = {
                local_id: localId,
                full_name: patientData.full_name,
                phone: patientData.phone,
                age: patientData.age,
                gender: patientData.gender,
                referring_doctor: patientData.referring_doctor,
                referral_source: patientData.referral_source,
                tests: patientData.tests || [],
                tests_count: patientData.tests_count || 0,
                tests_total: patientData.tests_total || 0,
                sample_location: patientData.sample_location || 'lab',
                total: patientData.total || 0,
                notes: patientData.notes,
                visit_date: patientData.visit_date,
                results: patientData.results || [],
                tubes: patientData.tubes || [],
                uploaded_files: patientData.uploaded_files || [],

                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            await this.db.put(STORES.patients, patient);
            console.log('💾 Patient saved locally:', localId);

            await this.db.add(STORES.queue, {
                patient_local_id: localId,
                operation: 'insert',
                status: 'pending',
                data: this._prepareSyncData(patient),
                timestamp: new Date().toISOString(),
                retries: 0
            });

            if (this.isOnline) {
                this.processQueue().catch(err => console.warn('Sync error:', err));
            }

            await this.saveToFile();
            return patient;
        }

        /* ============================================================
           حفظ نتيجة تحليل
        ============================================================ */
        async saveTestResult(patientLocalId, result) {
            await this.init();

            try {
                const patient = await this.db.getById(STORES.patients, patientLocalId);
                if (!patient) throw new Error('Patient not found: ' + patientLocalId);

                if (!Array.isArray(patient.results)) {
                    patient.results = [];
                }

                const existingIndex = patient.results.findIndex(
                    r => Number(r.test_id) === Number(result.test_id)
                );

                const now = new Date().toISOString();

                if (existingIndex > -1) {
                    patient.results[existingIndex] = {
                        ...patient.results[existingIndex],
                        ...result,
                        updated_at: now
                    };
                    console.log('📝 Updated existing result for test:', result.test_id);
                } else {
                    patient.results.push({
                        ...result,
                        created_at: now,
                        updated_at: now
                    });
                    console.log('➕ Added new result for test:', result.test_id);
                }

                patient.updated_at = now;
                patient.sync_status = 'pending';

                await this.db.put(STORES.patients, patient);

                try {
                    await this.db.add(STORES.queue, {
                        patient_local_id: patientLocalId,
                        operation: 'update',
                        status: 'pending',
                        data: this._prepareSyncData(patient),
                        timestamp: now,
                        retries: 0
                    });
                } catch (queueError) {
                    console.warn('⚠️ Failed to add to queue:', queueError);
                }

                if (this.isOnline) {
                    this.processQueue().catch(err => {
                        console.warn('Background sync failed:', err);
                    });
                }

                this.saveToFile().catch(err => {
                    console.warn('Save to file failed:', err);
                });

                console.log('✅ Test result saved:', result.test_name || result.test_id);
                return patient;

            } catch (error) {
                console.error('❌ Save test result error:', error);
                throw error;
            }
        }

        /* ============================================================
           ✅ ملفات النتائج المرفوعة (PDF)
        ============================================================ */
        async addUploadedFile(patientLocalId, fileData) {
            await this.init();

            const patient = await this.db.getById(STORES.patients, patientLocalId);
            if (!patient) throw new Error('Patient not found');

            if (!Array.isArray(patient.uploaded_files)) {
                patient.uploaded_files = [];
            }

            const fileId = fileData.id || ('file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));

            patient.uploaded_files.push({
                id: fileId,
                file_name: fileData.file_name,
                file_path: fileData.file_path,
                result_date: fileData.result_date,
                test_type: fileData.test_type || null,
                notes: fileData.notes || null,
                file_size: fileData.file_size || null,
                uploaded_at: new Date().toISOString()
            });

            patient.updated_at = new Date().toISOString();
            patient.sync_status = 'pending';

            await this.db.put(STORES.patients, patient);

            await this.db.add(STORES.queue, {
                patient_local_id: patientLocalId,
                operation: 'update',
                status: 'pending',
                data: this._prepareSyncData(patient),
                timestamp: new Date().toISOString(),
                retries: 0
            });

            if (this.isOnline) {
                this.processQueue().catch(err => console.warn(err));
            }

            return patient;
        }

        async removeUploadedFile(patientLocalId, fileId) {
            await this.init();

            const patient = await this.db.getById(STORES.patients, patientLocalId);
            if (!patient) throw new Error('Patient not found');

            const file = (patient.uploaded_files || []).find(f => f.id === fileId);

            patient.uploaded_files = (patient.uploaded_files || []).filter(f => f.id !== fileId);
            patient.updated_at = new Date().toISOString();
            patient.sync_status = 'pending';

            await this.db.put(STORES.patients, patient);

            await this.db.add(STORES.queue, {
                patient_local_id: patientLocalId,
                operation: 'update',
                status: 'pending',
                data: this._prepareSyncData(patient),
                timestamp: new Date().toISOString(),
                retries: 0
            });

            if (this.isOnline) {
                this.processQueue().catch(err => console.warn(err));
            }

            return { patient, file };
        }

        /* ============================================================
           تحديث مريض موجود
        ============================================================ */
        async updatePatient(patientLocalId, updates) {
            await this.init();

            try {
                const patient = await this.db.getById(STORES.patients, patientLocalId);
                if (!patient) throw new Error('Patient not found');

                Object.assign(patient, updates, {
                    updated_at: new Date().toISOString(),
                    sync_status: 'pending'
                });

                await this.db.put(STORES.patients, patient);

                await this.db.add(STORES.queue, {
                    patient_local_id: patientLocalId,
                    operation: 'update',
                    status: 'pending',
                    data: this._prepareSyncData(patient),
                    timestamp: new Date().toISOString(),
                    retries: 0
                });

                if (this.isOnline) {
                    this.processQueue().catch(err => console.warn(err));
                }

                await this.saveToFile();
                return patient;

            } catch (error) {
                console.error('Update patient error:', error);
                throw error;
            }
        }

        /* ============================================================
           حذف مريض
        ============================================================ */
        async deletePatient(patientLocalId) {
            await this.init();

            try {
                await this.db.delete(STORES.patients, patientLocalId);
                console.log('🗑️ Patient deleted:', patientLocalId);

                if (window.supabaseNew && this.isOnline) {
                    await window.supabaseNew
                        .from('lab_patients')
                        .delete()
                        .eq('local_id', patientLocalId);
                }

                await this.saveToFile();
                return true;

            } catch (error) {
                console.error('Delete patient error:', error);
                throw error;
            }
        }

        /* ============================================================
           تجهيز البيانات للمزامنة
           ✅ تمت إضافة tubes
        ============================================================ */
        _prepareSyncData(patient) {
            return {
                local_id: patient.local_id,
                full_name: patient.full_name,
                phone: patient.phone,
                age: patient.age,
                gender: patient.gender,
                referring_doctor: patient.referring_doctor,
                referral_source: patient.referral_source,
                tests: patient.tests,
                tests_count: patient.tests_count,
                tests_total: patient.tests_total,
                sample_location: patient.sample_location,
                total: patient.total,
                notes: patient.notes,
                visit_date: patient.visit_date,
                results: patient.results,
                tubes: patient.tubes || [],
                uploaded_files: patient.uploaded_files || [],
                created_at: patient.created_at,
                updated_at: patient.updated_at
            };
        }

        /* ============================================================
           مزامنة الطابور
        ============================================================ */
        async processQueue() {
            if (this.syncing || !this.isOnline) return;

            this.syncing = true;
            this.notify('sync-start');

            try {
                const queue = await this.db.getAll(STORES.queue);
                const pending = queue.filter(item => item.status === 'pending' || item.status === 'failed');

                if (pending.length === 0) {
                    this.syncing = false;
                    this.notify('sync-complete', { synced: 0 });
                    return;
                }

                console.log('🔄 Processing queue:', pending.length, 'items');
                let synced = 0;

                for (const item of pending) {
                    try {
                        if (!window.supabaseNew) {
                            throw new Error('Supabase client not ready');
                        }

                        const payload = { ...item.data };

                        let error;
                        if (item.operation === 'insert') {
                            const result = await window.supabaseNew
                                .from('lab_patients')
                                .insert(payload);
                            error = result.error;
                        } else {
                            const result = await window.supabaseNew
                                .from('lab_patients')
                                .upsert(payload, { onConflict: 'local_id' });
                            error = result.error;
                        }

                        if (error) throw error;

                        const patient = await this.db.getById(STORES.patients, item.patient_local_id);
                        if (patient) {
                            patient.sync_status = 'synced';
                            await this.db.put(STORES.patients, patient);
                        }

                        await this.db.delete(STORES.queue, item.queue_id);
                        synced++;

                    } catch (error) {
                        console.warn('Sync failed for item:', item.queue_id, error.message);

                        item.status = 'failed';
                        item.retries = (item.retries || 0) + 1;
                        item.last_error = error.message;

                        if (item.retries >= 5) {
                            item.status = 'dead';
                        }

                        await this.db.put(STORES.queue, item);
                    }
                }

                console.log('✅ Sync complete:', synced, 'synced');
                this.notify('sync-complete', { synced });

            } catch (error) {
                console.error('Queue processing error:', error);
                this.notify('sync-error', error);
            } finally {
                this.syncing = false;
            }
        }

        /* ============================================================
           جلب المرضى
        ============================================================ */
        async getAllPatients() {
            await this.init();
            return this.db.getAll(STORES.patients);
        }

        async getPatientById(localId) {
            await this.init();
            return this.db.getById(STORES.patients, localId);
        }

        async getPatientsByDate(dateStr) {
            await this.init();
            return this.db.getByIndex(STORES.patients, 'visit_date', dateStr);
        }

        async getTodayPatients() {
            const today = new Date().toISOString().slice(0, 10);
            return this.getPatientsByDate(today);
        }

        async findPatientByPhone(phone) {
            await this.init();
            const patients = await this.db.getByIndex(STORES.patients, 'phone', phone);
            return patients[0] || null;
        }

        /* ============================================================
           الحفظ في localStorage
        ============================================================ */
        async saveToFile() {
            try {
                const patients = await this.getAllPatients();

                const byDate = {};
                patients.forEach(p => {
                    const date = p.visit_date || (p.created_at ? p.created_at.slice(0, 10) : 'unknown');
                    if (!byDate[date]) byDate[date] = [];
                    byDate[date].push(p);
                });

                localStorage.setItem('medlab-database', JSON.stringify(byDate));
                localStorage.setItem('medlab-database-last-update', new Date().toISOString());

                this.notify('db-saved', {
                    dates: Object.keys(byDate).length,
                    total: patients.length
                });

                return byDate;

            } catch (error) {
                console.error('Save to file error:', error);
            }
        }

        /* ============================================================
           تنزيل الملفات
        ============================================================ */
        async downloadAllAsFiles() {
            try {
                const patients = await this.getAllPatients();

                if (!patients.length) {
                    alert('لا توجد بيانات لتنزيلها');
                    return;
                }

                const byDate = {};
                patients.forEach(p => {
                    const date = p.visit_date || (p.created_at ? p.created_at.slice(0, 10) : 'unknown');
                    if (!byDate[date]) byDate[date] = [];
                    byDate[date].push(p);
                });

                if ('showDirectoryPicker' in window) {
                    try {
                        const dirHandle = await window.showDirectoryPicker({
                            mode: 'readwrite',
                            startIn: 'documents'
                        });

                        const medlabDir = await dirHandle.getDirectoryHandle('medlab-database', { create: true });

                        for (const [date, datePatients] of Object.entries(byDate)) {
                            const dateDir = await medlabDir.getDirectoryHandle(date, { create: true });
                            await this.writeFile(dateDir, 'patients.json', JSON.stringify(datePatients, null, 2));
                            await this.writeFile(dateDir, 'patients.csv', this.buildCSV(datePatients));
                            await this.writeFile(dateDir, 'summary.txt', this.buildSummary(date, datePatients));
                        }

                        await this.writeFile(medlabDir, 'index.json', JSON.stringify({
                            generated_at: new Date().toISOString(),
                            total_patients: patients.length,
                            dates: Object.keys(byDate).map(d => ({ date: d, patients_count: byDate[d].length }))
                        }, null, 2));

                        alert('✅ تم حفظ الملفات في مجلد medlab-database');
                        return;

                    } catch (e) {
                        if (e.name === 'AbortError') return;
                        console.warn('File System API failed:', e);
                    }
                }

                for (const [date, datePatients] of Object.entries(byDate)) {
                    this.downloadJSON(`${date}_patients.json`, datePatients);
                    await this.sleep(300);
                    this.downloadCSV(`${date}_patients.csv`, datePatients);
                    await this.sleep(300);
                }

                alert('✅ تم تنزيل الملفات');

            } catch (error) {
                console.error('Download error:', error);
                alert('حدث خطأ أثناء تنزيل الملفات');
            }
        }

        async writeFile(dirHandle, filename, content) {
            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
        }

        downloadJSON(filename, data) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        downloadCSV(filename, patients) {
            const csv = this.buildCSV(patients);
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        buildCSV(patients) {
            const headers = ['الاسم', 'الهاتف', 'العمر', 'الجنس', 'الطبيب المحول', 'المصدر', 'عدد التحاليل', 'التحاليل', 'الإجمالي', 'تاريخ الزيارة', 'ملاحظات'];

            const rows = patients.map(p => [
                p.full_name || '',
                p.phone || '',
                p.age || '',
                p.gender === 'male' ? 'ذكر' : p.gender === 'female' ? 'أنثى' : '',
                p.referring_doctor || '',
                p.referral_source || '',
                p.tests_count || 0,
                (p.tests || []).map(t => t.name).join(' | '),
                p.total || 0,
                p.visit_date || '',
                p.notes || ''
            ]);

            return [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');
        }

        buildSummary(date, patients) {
            const total = patients.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
            const totalTests = patients.reduce((sum, p) => sum + (Number(p.tests_count) || 0), 0);

            return `============================================================
ملخص مرضى معمل ميدلاب - ${date}
============================================================

إجمالي المرضى: ${patients.length}
إجمالي التحاليل: ${totalTests}
إجمالي الإيرادات: ${total} جنيه

------------------------------------------------------------
قائمة المرضى:
------------------------------------------------------------

${patients.map((p, i) => `
${i + 1}. ${p.full_name}
   📞 ${p.phone}
   🎂 ${p.age || '—'} سنة | ${p.gender === 'male' ? 'ذكر' : p.gender === 'female' ? 'أنثى' : '—'}
   💰 ${p.total} جنيه (${p.tests_count} تحليل)
   📅 ${p.visit_date}
   ${p.notes ? '📝 ' + p.notes : ''}
`).join('\n')}

============================================================
تم الإنشاء: ${new Date().toLocaleString('ar-EG')}
============================================================
`;
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        /* ============================================================
           إحصائيات
        ============================================================ */
        async getStats() {
            const patients = await this.getAllPatients();
            const queue = await this.db.getAll(STORES.queue);

            const pending = queue.filter(q => q.status === 'pending').length;
            const failed = queue.filter(q => q.status === 'failed').length;

            return {
                total: patients.length,
                synced: patients.filter(p => p.sync_status === 'synced').length,
                pending: patients.filter(p => p.sync_status === 'pending').length,
                queuePending: pending,
                queueFailed: failed
            };
        }

        async getStatsByDate(dateStr) {
            const patients = await this.getPatientsByDate(dateStr);
            const total = patients.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
            const totalTests = patients.reduce((sum, p) => sum + (Number(p.tests_count) || 0), 0);
            const homeSamples = patients.filter(p => p.sample_location === 'home').length;

            return {
                patientsCount: patients.length,
                totalRevenue: total,
                totalTests: totalTests,
                homeSamples: homeSamples
            };
        }
    }

    /* ============================================================
       التصدير
    ============================================================ */
    window.LabStorage = new LabStorage();

    window.LabStorage.init().then(() => {
        console.log('✅ LabStorage ready (v3.1)');
    }).catch(err => {
        console.error('❌ LabStorage init error:', err);
    });

})();
