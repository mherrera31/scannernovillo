// =======================================================
// CONFIGURACIÓN DE SUPABASE (¡REEMPLAZAR!)
// =======================================================
const SUPABASE_URL = 'https://jdfumtexhluvdajbwkma.supabase.co'; // Ej: 'https://xyz.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZnVtdGV4aGx1dmRhamJ3a21hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyMDE0NDQsImV4cCI6MjA3NTc3NzQ0NH0.qKrGQY3cccdY1pCrNUkMXbww2x0D23drKGLlw0oRn-k'; // La clave anónima (anon key)

const AUTH_ENDPOINT = `${SUPABASE_URL}/auth/v1`;
const API_ENDPOINT = `${SUPABASE_URL}/rest/v1`;

// =======================================================
// ELEMENTOS DEL DOM
// =======================================================
const loginSection = document.getElementById('login-section');
const scannerSection = document.getElementById('scanner-section');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const userDisplay = document.getElementById('user-display');
const branchDisplay = document.getElementById('branch-display');
const logoutButton = document.getElementById('logout-button');
const scanButton = document.getElementById('scan-button');
const qrReaderDiv = document.getElementById('qr-reader');
const scanStatus = document.getElementById('scan-status');
const resultSection = document.getElementById('result-section');
const resultConsecutive = document.getElementById('result-consecutive');
const resultValueCrc = document.getElementById('result-value-crc');
const resultValueUsd = document.getElementById('result-value-usd');
const resultValidity = document.getElementById('result-validity'); // Placeholder, necesita datos de tablas relacionadas
const resultRestrictions = document.getElementById('result-restrictions'); // Placeholder, necesita datos de tablas relacionadas
const resultExpiration = document.getElementById('result-expiration');
const resultStatus = document.getElementById('result-status');
const redeemButton = document.getElementById('redeem-button');
const invoiceInputArea = document.getElementById('invoice-input-area');
const invoiceNumberInput = document.getElementById('invoice-number');

// =======================================================
// ESTADO DE LA APLICACIÓN
// =======================================================
let currentUser = null;
let userProfile = null; // Guardará el perfil con rol y sucursal
let currentToken = null;
let html5QrCode = null;
let scannedCouponData = null; // Para guardar los datos del cupón escaneado

// =======================================================
// FUNCIONES DE UTILIDAD Y API
// =======================================================

function showElement(element) {
    if (element) element.style.display = 'block';
}

function hideElement(element) {
    if (element) element.style.display = 'none';
}

function setStatusMessage(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.className = `status-message status-${type}`; // Asigna clase CSS para color
    showElement(element);
}

// Función genérica para llamadas a la API REST de Supabase
async function fetchSupabase(endpoint, method = 'GET', body = null) {
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation' // Para obtener el registro actualizado en PATCH/POST
    };

    const options = { method, headers };
    if (body && (method === 'POST' || method === 'PATCH')) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_ENDPOINT}/${endpoint}`, options);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        // Si no hay contenido (DELETE), devolver success
        if (response.status === 204) {
            return { success: true };
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch Supabase Error:', error);
        throw error; // Re-lanzar para manejarlo en la función que llama
    }
}

// =======================================================
// FUNCIONES DE AUTENTICACIÓN
// =======================================================

async function handleLogin(event) {
    event.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;
    loginError.textContent = ''; // Limpiar errores previos

    try {
        // 1. Autenticar y obtener token
        const response = await fetch(`${AUTH_ENDPOINT}/token?grant_type=password`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error_description || 'Credenciales inválidas');
        }

        const data = await response.json();
        currentUser = data.user;
        currentToken = data.access_token;

        // 2. Obtener perfil del usuario (rol y sucursal)
        // Usamos la función fetchSupabase que ya incluye el token
        const profileData = await fetchSupabase(`profiles?id=eq.${currentUser.id}&select=*,role:roles(role_name),branch:branches(id,name)`);

        if (!profileData || profileData.length === 0) {
            throw new Error('Perfil no encontrado o sin rol asignado.');
        }
        userProfile = profileData[0];

        // 3. Verificar si tiene rol permitido (Cashier o Admin)
        if (!userProfile.role || !['Cashier', 'Admin'].includes(userProfile.role.role_name)) {
            throw new Error('Acceso denegado. Rol no permitido para escanear.');
        }

        // 4. Guardar sesión (ej. en localStorage) y actualizar UI
        localStorage.setItem('authToken', currentToken);
        localStorage.setItem('userData', JSON.stringify(currentUser));
        localStorage.setItem('userProfile', JSON.stringify(userProfile)); // Guardar perfil completo

        updateUIForLoggedInUser();

    } catch (error) {
        console.error('Login failed:', error);
        loginError.textContent = error.message;
        clearSession(); // Limpiar si falla
    }
}

function handleLogout() {
    clearSession();
    updateUIForLoggedOutUser();
    stopScanner(); // Detener el escáner si estaba activo
}

function clearSession() {
    currentUser = null;
    userProfile = null;
    currentToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('userProfile');
}

function checkSession() {
    currentToken = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    const profileData = localStorage.getItem('userProfile');

    if (currentToken && userData && profileData) {
        try {
            currentUser = JSON.parse(userData);
            userProfile = JSON.parse(profileData);
            updateUIForLoggedInUser();
        } catch (e) {
            console.error("Error parsing stored session data:", e);
            clearSession();
            updateUIForLoggedOutUser();
        }
    } else {
        clearSession();
        updateUIForLoggedOutUser();
    }
}

// =======================================================
// FUNCIONES DEL ESCÁNER Y CANJE
// =======================================================

function startScanner() {
    hideElement(scanButton);
    showElement(qrReaderDiv);
    scanStatus.textContent = "Apunte la cámara al código QR...";
    setStatusMessage(scanStatus, "Apunte la cámara al código QR...", "info");
    hideElement(resultSection); // Ocultar resultados anteriores

    // Si ya existe una instancia, la detenemos antes de crear una nueva
    if (html5QrCode && html5QrCode.isScanning) {
        stopScanner();
    }

    // Inicializar el escáner
    html5QrCode = new Html5Qrcode("qr-reader");
    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        // `decodedText` contiene el UUID del cupón
        console.log(`Code matched = ${decodedText}`, decodedResult);
        setStatusMessage(scanStatus, `QR detectado: ${decodedText.substring(0, 8)}... Obteniendo datos...`, "info");
        stopScanner(); // Detener escaneo tras éxito
        fetchCouponData(decodedText);
    };
    const config = { fps: 20 };

    // Iniciar escaneo usando la cámara trasera preferentemente
    html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
        .catch(err => {
            console.error("Error starting QR scanner:", err);
            setStatusMessage(scanStatus, "Error al iniciar la cámara. Verifique permisos.", "invalid");
            showElement(scanButton); // Mostrar botón para reintentar
            hideElement(qrReaderDiv);
        });
}

function stopScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(ignore => {
            // QR Code scanning is stopped.
            console.log("QR Code scanning stopped.");
            showElement(scanButton); // Mostrar botón de nuevo
            hideElement(qrReaderDiv);
            scanStatus.textContent = ""; // Limpiar estado
        }).catch(err => {
            console.error("Error stopping scanner:", err);
        });
    } else {
        showElement(scanButton); // Asegurarse que el botón se muestre si no estaba escaneando
        hideElement(qrReaderDiv);
    }
}

async function fetchCouponData(couponId) {
    setStatusMessage(scanStatus, "Buscando cupón...", "info");
    hideElement(resultSection);
    scannedCouponData = null; // Resetear datos anteriores

    // Query compleja para obtener toda la info relacionada
    // coupons?id=eq.{couponId}&select=*,batch:batch_id(*,type:types(type_name)),scopes:coupon_scopes(scope:validity_scopes(scope_name)),restrictions:coupon_restrictions(restriction:restrictions(restriction_description))
    const selectQuery = `*,batch:batch_id(*,type:types(type_name)),scopes:coupon_scopes(scope:validity_scopes(scope_name)),restrictions:coupon_restrictions(restriction:restrictions(restriction_description))`;

    try {
        const data = await fetchSupabase(`coupons?id=eq.${couponId}&select=${selectQuery}`);

        if (!data || data.length === 0) {
            setStatusMessage(scanStatus, `Cupón ID ${couponId} no encontrado.`, "invalid");
            return;
        }

        scannedCouponData = data[0];
        console.log("Coupon Data:", scannedCouponData);

        // --- Mostrar Datos ---
        resultConsecutive.textContent = scannedCouponData.consecutive || 'N/A';
        resultValueCrc.textContent = `₡${parseFloat(scannedCouponData.base_value_colones || 0).toFixed(2)}`;
        resultValueUsd.textContent = `$${parseFloat(scannedCouponData.base_value_dolares || 0).toFixed(2)}`;
        resultExpiration.textContent = scannedCouponData.expiration_date || 'N/A';

        // Procesar Validez y Restricciones (vienen como arrays)
        const validityNames = scannedCouponData.scopes?.map(s => s.scope?.scope_name).filter(Boolean).join(', ') || 'General';
        resultValidity.textContent = validityNames;
        const restrictionNames = scannedCouponData.restrictions?.map(r => r.restriction?.restriction_description).filter(Boolean).join('; ') || 'Ninguna';
        resultRestrictions.textContent = restrictionNames;

        // --- Realizar Validaciones ---
        let canRedeem = true;
        let statusMsg = '';
        let statusType = 'valid';

        // 1. Ya canjeado?
        if (scannedCouponData.is_redeemed) {
            statusMsg = "Este cupón YA FUE CANJEADO.";
            statusType = "invalid";
            canRedeem = false;
        }

        // 2. Expirado?
        const today = new Date().toISOString().split('T')[0];
        if (canRedeem && scannedCouponData.expiration_date < today) {
            statusMsg = "Este cupón HA EXPIRADO.";
            statusType = "invalid";
            canRedeem = false;
        }

        // 3. Válido en esta sucursal?
        const allowedBranches = scannedCouponData.branch_permissions || []; // Array de IDs de sucursal permitidas
        const userBranchId = userProfile?.branch?.id; // ID de la sucursal del cajero

        // Si hay sucursales específicas Y la del cajero no está en la lista O no tiene sucursal asignada
        if (canRedeem && allowedBranches.length > 0 && (!userBranchId || !allowedBranches.includes(String(userBranchId)))) {
             statusMsg = `Cupón NO VÁLIDO en esta sucursal (${userProfile?.branch?.name || 'N/A'}).`;
             statusType = "invalid";
             canRedeem = false;
        } else if (canRedeem && allowedBranches.length > 0) {
             // Es válido en esta sucursal (si pasó la condición anterior)
             statusMsg = `Cupón VÁLIDO para canjear en ${userProfile?.branch?.name || 'esta sucursal'}.`;
             statusType = "valid";
        } else if (canRedeem) {
             // Válido en todas las sucursales
             statusMsg = "Cupón VÁLIDO para canjear.";
             statusType = "valid";
        }


        // Mostrar estado y botón de canje si es válido
        setStatusMessage(resultStatus, statusMsg, statusType);
        if (canRedeem) {
            showElement(redeemButton);
            showElement(invoiceInputArea); // Mostrar campo de factura
            invoiceNumberInput.value = ""; // Limpiar campo de factura anterior
        } else {
            hideElement(redeemButton);
            hideElement(invoiceInputArea); // Ocultar campo de factura
        }

        showElement(resultSection); // Mostrar toda la sección de resultados
        scanStatus.textContent = ""; // Limpiar estado del scanner

    } catch (error) {
        setStatusMessage(scanStatus, `Error al obtener datos: ${error.message}`, "invalid");
        console.error("Fetch coupon data error:", error);
    }
}

async function handleRedeem() {
    if (!scannedCouponData || !userProfile || !currentUser) {
        setStatusMessage(resultStatus, "Error: No hay datos de cupón o usuario.", "invalid");
        return;
    }

    const couponId = scannedCouponData.id;
    const redemptionBranchId = userProfile.branch?.id;
    const redeemedByUserId = currentUser.id;
    
    // --- INICIO CAMBIO: VALIDACIÓN OBLIGATORIA ---
    const invoiceNumber = invoiceNumberInput.value.trim(); // Quitar '|| null'

    // Validar que la factura no esté vacía
    if (!invoiceNumber) {
        setStatusMessage(resultStatus, "Error: El número de factura es obligatorio para canjear.", "invalid");
        // Asegurarse que el botón de canje siga visible para reintentar
        showElement(redeemButton);
        return; // Detener la función
    }
    // --- FIN CAMBIO ---

    if (!redemptionBranchId) {
         setStatusMessage(resultStatus, "Error: El usuario no tiene una sucursal asignada.", "invalid");
         return;
    }


    setStatusMessage(resultStatus, "Procesando canje...", "info");
    hideElement(redeemButton); // Ocultar botón mientras procesa

    const updatePayload = {
        is_redeemed: true,
        redemption_date: new Date().toISOString(),
        redemption_branch_id: redemptionBranchId,
        redeemed_by_user_id: redeemedByUserId,
        invoice_number: invoiceNumber // Ahora siempre enviará el valor
    };

    try {
        const updatedCoupon = await fetchSupabase(`coupons?id=eq.${couponId}`, 'PATCH', updatePayload);

        if (updatedCoupon && updatedCoupon.length > 0 && updatedCoupon[0].is_redeemed) {
            setStatusMessage(resultStatus, "¡Cupón canjeado con éxito!", "valid");
            // Podríamos actualizar los datos mostrados si fuera necesario
            scannedCouponData.is_redeemed = true; // Actualizar estado local
            hideElement(invoiceInputArea); // Ocultar campo de factura después de canjear
        } else {
             throw new Error("La actualización no se confirmó.");
        }

    } catch (error) {
        setStatusMessage(resultStatus, `Error al canjear: ${error.message}`, "invalid");
        showElement(redeemButton); // Mostrar botón para reintentar si falla
        console.error("Redeem coupon error:", error);
    }
}


// =======================================================
// ACTUALIZACIÓN DE UI (LOGIN/LOGOUT)
// =======================================================

function updateUIForLoggedInUser() {
    hideElement(loginSection);
    showElement(scannerSection);
    userDisplay.textContent = userProfile?.username || currentUser?.email || 'N/A';
    branchDisplay.textContent = userProfile?.branch?.name || 'No asignada';
    loginError.textContent = ''; // Limpiar errores de login
    hideElement(resultSection); // Ocultar resultados al iniciar sesión
    scanStatus.textContent = ''; // Limpiar status scanner
    showElement(scanButton); // Asegurar que el botón de scan esté visible
    hideElement(qrReaderDiv); // Ocultar el div del lector
}

function updateUIForLoggedOutUser() {
    showElement(loginSection);
    hideElement(scannerSection);
    loginForm.reset(); // Limpiar formulario de login
    hideElement(resultSection);
    scanStatus.textContent = '';
    showElement(scanButton);
    hideElement(qrReaderDiv);
}

// =======================================================
// INICIALIZACIÓN Y EVENT LISTENERS
// =======================================================

document.addEventListener('DOMContentLoaded', () => {
    checkSession(); // Verificar si hay sesión activa al cargar

    loginForm.addEventListener('submit', handleLogin);
    logoutButton.addEventListener('click', handleLogout);
    scanButton.addEventListener('click', startScanner);
    redeemButton.addEventListener('click', handleRedeem);
});
