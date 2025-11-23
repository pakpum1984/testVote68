// Import Firebase modules
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    runTransaction,
    collection,
    getDocs,
    increment,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCWRIFj6NHeHkXL1bIEbb93lUzaZf8NNmI",
    authDomain: "fir-crud-b7960.firebaseapp.com",
    projectId: "fir-crud-b7960",
    storageBucket: "fir-crud-b7960.firebasestorage.app",
    messagingSenderId: "32150734884",
    appId: "1:32150734884:web:58b01e9f4ba0d9b9a170b1",
    measurementId: "G-K97E7L101D"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);
// ตั้งค่า emulator สำหรับการพัฒนา
// if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
//     connectFunctionsEmulator(functions, "localhost", 5001);
// }
// ตัวแปรเก็บข้อมูลพนักงานปัจจุบัน
let currentEmployee = null;
let candidates = [];
let selectedCandidate = null;
// ฟังก์ชันล็อกอินแบบ Anonymous
async function initializeAuth() {
    try {
        await signInAnonymously(auth);
        console.log("Anonymous authentication successful");
    } catch (error) {
        console.error("Authentication failed:", error);
        showError('เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อระบบได้');
    }
}
// ฟังก์ชันบันทึก Audit Log (ใช้ Cloud Functions)
async function logAction(action, details = null) {
    try {
        const logAuditFunction = httpsCallable(functions, 'logAuditEvent');
        await logAuditFunction({
            action: action,
            employeeId: currentEmployee ? currentEmployee.id : 'unknown',
            details: details
        });
    } catch (error) {
        console.error('Error logging action:', error);
    }
}
// ฟังก์ชันสร้าง Vote Hash
function generateVoteHash(employeeId, candidateId) {
    const timestamp = new Date().getTime();
    const data = `${employeeId}-${candidateId}-${timestamp}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}
// ฟังก์ชัน Track Page View (ใหม่: สำหรับบันทึกการเข้าชม)
async function trackPageView(page, employeeId = null) {
    try {
        const trackFunction = httpsCallable(functions, 'trackPageView');
        await trackFunction({ page: page, employeeId: employeeId });
        console.log(`Tracked page view: ${page}`);
    } catch (error) {
        console.error('Error tracking page:', error);  // Non-critical, ไม่ block UI
    }
}
// ฟังก์ชันโหลดข้อมูลผู้สมัครจาก Firestore
async function loadCandidatesFromFirestore() {
    try {
        const querySnapshot = await getDocs(collection(db, 'candidates'));
        candidates = [];
      
        querySnapshot.forEach((doc) => {
            const candidate = doc.data();
            candidate.id = doc.id;
            candidates.push(candidate);
        });

        // เรียงลำดับ: ผู้สมัครปกติตามหมายเลข (ascending) แล้วตามด้วย novote
        // แก้ไข: ดึงตัวเลขจาก "เบอร์X" โดยลบ "เบอร์" ออก แล้ว parse เป็น integer
        candidates.sort((a, b) => {
            if (a.number === 'novote') return 1;
            if (b.number === 'novote') return -1;
            
            // ดึงตัวเลขจาก string เช่น "เบอร์5" -> 5
            const getNumberValue = (numStr) => {
                const cleanNum = numStr.replace(/เบอร์/g, '').trim(); // ลบ "เบอร์" และช่องว่าง
                return parseInt(cleanNum, 10) || Infinity; // ถ้า parse ไม่ได้ ให้คืน Infinity เพื่อเรียงท้ายสุด
            };
            
            const aNum = getNumberValue(a.number);
            const bNum = getNumberValue(b.number);
            
            return aNum - bNum;
        });
      
        if (candidates.length > 0) {
            console.log('Candidates loaded from Firestore:', candidates.length + ' candidates');
            return true;
        } else {
            console.log('No candidates found in database');
            showError('ระบบกำลังเตรียมข้อมูล', 'กรุณารอสักครู่หรือติดต่อผู้ดูแลระบบ');
            return false;
        }
    } catch (error) {
        console.error('Error loading candidates from Firestore:', error);
        showError('ไม่สามารถโหลดข้อมูลได้', 'กรุณาติดต่อผู้ดูแลระบบ');
        return false;
    }
}
// ฟังก์ชันแสดง SweetAlert Error
function showError(title, message) {
    Swal.fire({
        position: 'center',
        icon: 'error',
        title: `<h4>${title}</h4>`,
        html: `<h5>${message}</h5>`,
        showConfirmButton: true,
        allowOutsideClick: false
    });
}
// ฟังก์ชันแสดง SweetAlert Success
function showSuccess(title, message) {
    Swal.fire({
        position: 'center',
        icon: 'success',
        title: `<h4>${title}</h4>`,
        html: `<h5>${message}</h5>`,
        showConfirmButton: false,
        timer: 2000
    });
}
// ฟังก์ชันแสดง Loading
function showLoading(title) {
    Swal.fire({
        position: 'center',
        title: `<h4>${title}</h4>`,
        showConfirmButton: false,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
}
document.addEventListener('DOMContentLoaded', async function() {
    // เริ่มต้นระบบ Authentication
    await initializeAuth();
    // Track การ load หน้าแรก (login/index)
    await trackPageView('login');
    // โหลดข้อมูลผู้สมัครจาก Firestore
    const candidatesLoaded = await loadCandidatesFromFirestore();

    if (!candidatesLoaded) {
        return;
    }
    // ตั้งค่าปุ่มตรวจสอบรหัสพนักงาน
    const employeeIdInput = document.getElementById('loginEmployeeId');
    const loginError = document.getElementById('loginError');
    const checkEmployeeBtn = document.getElementById('checkEmployeeBtn');
    checkEmployeeBtn.addEventListener('click', checkEmployeeLogin);

    // รองรับการกด Enter เพื่อตรวจสอบ
    employeeIdInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            checkEmployeeLogin();
        }
    });
    // ตั้งค่าฟอร์มเลือกตั้ง
    document.getElementById('electionForm').addEventListener('submit', function(e) {
        e.preventDefault();
    });
    // ปุ่มเปลี่ยนการเลือก
    document.getElementById('changeSelection').addEventListener('click', function() {
        document.getElementById('voteConfirm').style.display = 'none';
        document.querySelectorAll('.candidate-card').forEach(card => {
            card.classList.remove('selected');
            card.style.display = 'flex';
        });
        // รีเซ็ตปุ่มเลือกทั้งหมด
        document.querySelectorAll('.select-candidate-btn').forEach(btn => {
            btn.textContent = 'เลือกผู้สมัคร';
            btn.disabled = false;
            btn.style.background = '';
        });
        selectedCandidate = null;
        document.getElementById('selectedCandidateId').value = '';
    });
    // ปุ่มยืนยันการเลือก
    document.getElementById('confirmVote').addEventListener('click', submitVoteFirestore);
    // แสดงรายชื่อผู้สมัคร
    renderCandidates();
    // Bottom Navigation
    const links = document.querySelectorAll('.bottom-nav a');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            links.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
    // Top Navigation (Desktop)
    const topLinks = document.querySelectorAll('.top-nav .nav-link');
    topLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            topLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
    // ซ่อนหน้าเลือกตั้งและแสดงหน้า login เมื่อโหลดหน้าเว็บครั้งแรก
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('formSection').style.display = 'none';
    document.getElementById('thankYouSection').style.display = 'none';
});
// ฟังก์ชันแสดงรายชื่อผู้สมัคร
function renderCandidates() {
    const container = document.getElementById('candidatesContainer');
    container.innerHTML = '';

    if (candidates.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">ไม่พบข้อมูลผู้สมัครในระบบ</p>';
        return;
    }

    candidates.forEach(candidate => {
        const card = document.createElement('div');
        card.className = 'candidate-card';
        if (candidate.number === 'novote') {
            card.className += ' novote-card';
        }
        card.innerHTML = `
            <div class="candidate-image-container">
                <img src="${candidate.image}" alt="${candidate.name}" class="candidate-image" onerror="this.src='https://via.placeholder.com/200x200/4361ee/ffffff?text=No+Image'">
            </div>
            <div class="candidate-info">
                <div class="candidate-number">${candidate.number}</div>
     
                <button class="select-candidate-btn" data-candidate-id="${candidate.id}">เลือกผู้สมัคร</button>
            </div>
        `;
        card.addEventListener('click', () => selectCandidate(candidate));
        container.appendChild(card);
    });
    // เพิ่ม event listener สำหรับปุ่มเลือกผู้สมัคร
    document.querySelectorAll('.select-candidate-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation(); // ป้องกันการ trigger card click
            const candId = this.dataset.candidateId;
            const candidate = candidates.find(c => c.id === candId);
            if (candidate) {
                selectCandidate(candidate);
            }
        });
    });
}

// ฟังก์ชันเลือกผู้สมัคร
function selectCandidate(candidate) {
    const cards = document.querySelectorAll('.candidate-card');
    cards.forEach(card => {
        card.classList.remove('selected');
        card.style.display = 'none';
    });

    // Find and select the clicked card
    for (let i = 0; i < cards.length; i++) {
        const candidateNumber = cards[i].querySelector('.candidate-number').textContent;
        if (candidateNumber === candidate.number.toString()) {
            cards[i].classList.add('selected');
            cards[i].style.display = 'flex';
            // ปรับปุ่มเลือกใน card ที่เลือก
            const selectBtn = cards[i].querySelector('.select-candidate-btn');
            if (selectBtn) {
                selectBtn.textContent = 'เลือกแล้ว';
                selectBtn.disabled = true;
                selectBtn.style.background = 'var(--gradient-success)';
            }
            break;
        }
    }

    selectedCandidate = candidate;
    document.getElementById('selectedCandidateId').value = candidate.id;
    document.getElementById('selectedCandidateImage').src = candidate.image;
    document.getElementById('selectedCandidateName').textContent = candidate.name;
    document.getElementById('selectedCandidateParty').textContent = candidate.party;
    document.getElementById('selectedCandidateNumber').textContent = candidate.number;
   
    // เพิ่มบรรทัดนี้: ติ๊ก checkbox อัตโนมัติหลังเลือกผู้สมัคร
    document.getElementById('consentCheckbox').checked = true;
   
    document.getElementById('voteConfirm').style.display = 'block';
    document.getElementById('voteConfirm').scrollIntoView({ behavior: 'smooth' });
}
// แก้ไขฟังก์ชัน checkEmployeeLogin
async function checkEmployeeLogin() {
    const employeeId = document.getElementById('loginEmployeeId').value.trim();
    const loginError = document.getElementById('loginError');
    if (!employeeId) {
        loginError.textContent = 'กรุณากรอกรหัสพนักงาน';
        loginError.style.display = 'block';
        return;
    }
    try {
        showLoading('กำลังตรวจสอบ...');
        // ตรวจสอบข้อมูลพนักงานและสถานะการลงคะแนน
        const [employeeDoc, voteDoc] = await Promise.all([
            getDoc(doc(db, 'employees', employeeId)),
            getDoc(doc(db, 'electionResponses', employeeId))
        ]);
        if (employeeDoc.exists()) {
            const employeeData = employeeDoc.data();
          
            if (voteDoc.exists()) {
                showError('แจ้งเตือน', 'รหัสพนักงานนี้ได้ทำการลงคะแนนแล้ว');
            } else {
                currentEmployee = {
                    id: employeeId,
                    name: employeeData.name,
                    department: employeeData.department
                };
                document.getElementById('welcomeMessage').textContent =
                    `รหัสพนักงาน ${employeeId} ${currentEmployee.name} แผนก ${currentEmployee.department}`;
                // ซ่อนหน้า login และแสดงหน้าเลือกตั้ง
                document.getElementById('loginSection').style.display = 'none';
                document.getElementById('formSection').style.display = 'block';
                // Track การเข้าหน้าเลือกตั้ง
                await trackPageView('form', employeeId);
                Swal.close();
            }
        } else {
            showError('ไม่พบข้อมูล', 'รหัสพนักงานที่กรอกไม่ถูกต้อง');
        }
    } catch (error) {
        console.error('Error checking employee:', error);
        showError('เกิดข้อผิดพลาด', 'ไม่สามารถตรวจสอบข้อมูลพนักงานได้');
    }
}
// ฟังก์ชันลงคะแนนแบบ Firestore (ปลอดภัยกว่า)
async function submitVoteFirestore() {
    if (!validateForm()) return;
    
    const result = await Swal.fire({
        title: '<h4>ยืนยันการลงคะแนน</h4>',
        html: `
            <div style="text-align: center;">
                <img src="${selectedCandidate.image}" 
                     alt="${selectedCandidate.name}" 
                     style="width: 120px; height: 180px; border-radius: 8px; object-fit: cover; margin-bottom: 15px; border: 3px solid #4361ee;">
                <h5>คุณต้องการลงคะแนนให้</h5>
                <h4 style="color: #4361ee; margin: 10px 0;"><strong>${selectedCandidate.name}</strong></h4>
                <h5>ใช่หรือไม่?</h5>
            </div>
        `,
        // icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#4361ee',
        cancelButtonColor: '#6c757d'
    });

    if (!result.isConfirmed) return;
    
    try {
        showLoading('กำลังบันทึกข้อมูล...');
        // Track การ submit vote
        await trackPageView('vote-submit', currentEmployee.id);
        // วิธีที่ 1: ใช้ Firestore โดยตรง (เร็วที่สุด)
        await submitVoteDirect();
      
        showSuccess('ลงคะแนนสำเร็จ', 'ขอบคุณที่ใช้สิทธิ์เลือกตั้ง');
      
        // หลังจากแสดง success 2 วินาที แล้วแสดงหน้า thank you
        setTimeout(() => {
            document.getElementById('formSection').style.display = 'none';
            document.getElementById('thankYouSection').style.display = 'block';
            resetForm();
        }, 2000);
    } catch (error) {
        console.error('Error submitting vote:', error);
      
        let errorMessage = 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองอีกครั้ง';
        if (error.message.includes('already-exists')) {
            errorMessage = 'มีการลงคะแนนด้วยรหัสพนักงานนี้แล้ว';
        }
        showError('เกิดข้อผิดพลาด', errorMessage);
    }
}
// ฟังก์ชันลงคะแนนแบบ Firestore โดยตรง (เร็ว)
async function submitVoteDirect() {
    const voteHash = generateVoteHash(currentEmployee.id, selectedCandidate.id);

    // ใช้ Transaction สำหรับความปลอดภัย
    await runTransaction(db, async (transaction) => {
        // ตรวจสอบว่ายังไม่เคยลงคะแนน
        const voteRef = doc(db, 'electionResponses', currentEmployee.id);
        const voteDoc = await transaction.get(voteRef);
      
        if (voteDoc.exists()) {
            throw new Error('มีการลงคะแนนด้วยรหัสพนักงานนี้แล้ว');
        }
        // ตรวจสอบว่าพนักงานมีอยู่ในระบบ
        const employeeRef = doc(db, 'employees', currentEmployee.id);
        const employeeDoc = await transaction.get(employeeRef);
      
        if (!employeeDoc.exists()) {
            throw new Error('ข้อมูลพนักงานไม่พบในระบบ');
        }
        // ข้อมูลสำหรับบันทึกการโหวต
        const voteData = {
            employeeId: currentEmployee.id,
            fullName: currentEmployee.name,
            department: currentEmployee.department,
            candidateId: selectedCandidate.id,
            candidateName: selectedCandidate.name,
            candidateNumber: selectedCandidate.number,
            candidateParty: selectedCandidate.party,
            consent: document.getElementById('consentCheckbox').checked,
            timestamp: new Date().toISOString(),
            voteHash: voteHash,
            serverTimestamp: serverTimestamp()
        };
        // บันทึกการโหวต
        transaction.set(voteRef, voteData);
        // อัพเดทคะแนนผู้สมัครเฉพาะกรณีที่ไม่ใช่ novote
        if (selectedCandidate.number !== 'novote') {
            const candidateRef = doc(db, 'candidates', selectedCandidate.id);
            transaction.update(candidateRef, {
                votes: increment(1),
                lastUpdated: serverTimestamp()
            });
        }
    });
    // เรียก Cloud Functions สำหรับบันทึก audit log (แบบไม่รอผล)
    logAuditBackground(currentEmployee.id, selectedCandidate.id, voteHash);
}
// ฟังก์ชันบันทึก audit log แบบไม่รอผล (background)
async function logAuditBackground(employeeId, candidateId, voteHash) {
    try {
        const logAuditFunction = httpsCallable(functions, 'logAuditEvent');
        // ใช้ไม่ await เพื่อไม่ให้รอ
        logAuditFunction({
            action: 'VOTE_SUBMITTED_BACKGROUND',
            employeeId: employeeId,
            candidateId: candidateId,
            voteHash: voteHash
        }).catch(error => {
            console.log('Background audit log failed (non-critical):', error);
        });
    } catch (error) {
        console.log('Background audit log error (non-critical):', error);
    }
}
// ฟังก์ชันรีเซ็ตฟอร์ม
function resetForm() {
    document.getElementById('electionForm').reset();
    document.getElementById('voteConfirm').style.display = 'none';
    document.querySelectorAll('.candidate-card').forEach(card => {
        card.classList.remove('selected');
        card.style.display = 'flex';
    });
    // รีเซ็ตปุ่มเลือกทั้งหมด
    document.querySelectorAll('.select-candidate-btn').forEach(btn => {
        btn.textContent = 'เลือกผู้สมัคร';
        btn.disabled = false;
        btn.style.background = '';
    });
    selectedCandidate = null;
    currentEmployee = null;
    document.getElementById('welcomeMessage').textContent = '';
}
// ฟังก์ชันตรวจสอบความถูกต้องของฟอร์ม
function validateForm() {
    if (!selectedCandidate) {
        Swal.fire({
            position: 'top',
            icon: 'warning',
            title: '<h4>กรุณากรอกข้อมูลให้ครบถ้วน</h4>',
            text: 'กรุณาเลือกผู้สมัครที่ต้องการ',
            showConfirmButton: true,
            allowOutsideClick: false
        });
        return false;
    }
    if (!document.getElementById('consentCheckbox').checked) {
        Swal.fire({
            position: 'top',
            icon: 'warning',
            title: '<h4>กรุณากรอกข้อมูลให้ครบถ้วน</h4>',
            text: 'กรุณายินยอมให้ใช้ข้อมูล (รวมถึงการบันทึก IP)',
            showConfirmButton: true,
            allowOutsideClick: false
        });
        return false;
    }
    return true;
}
// ฟังก์ชันจัดการเมื่อออฟไลน์
function setupOfflineHandler() {
    const onlineStatus = document.createElement('div');
    onlineStatus.className = 'status-indicator';
    document.body.appendChild(onlineStatus);
    function updateOnlineStatus() {
        if (navigator.onLine) {
            onlineStatus.textContent = 'ออนไลน์';
            onlineStatus.className = 'status-indicator status-online';
        } else {
            onlineStatus.textContent = 'ออฟไลน์';
            onlineStatus.className = 'status-indicator status-offline';
        }
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
}
// เริ่มต้นจัดการสถานะออนไลน์
setupOfflineHandler();
