// API基础URL
const API_BASE_URL = 'http://localhost:8001';

// 全局变量
let networkInterfaces = [];
let currentConfig = {};

// 工具函数
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showMessage(message, type = 'info') {
    const messageEl = document.getElementById('message');
    messageEl.textContent = message;
    messageEl.className = `message ${type} fade-in`;
    messageEl.classList.remove('hidden');
    
    setTimeout(() => {
        messageEl.classList.add('hidden');
    }, 3000);
}

async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API调用失败:', error);
        throw error;
    }
}

// 网络接口管理
async function loadNetworkInterfaces() {
    try {
        const data = await apiCall('/api/network-interfaces');
        networkInterfaces = data.interfaces || [];
        
        const select = document.getElementById('networkPorts');
        select.innerHTML = '';
        
        networkInterfaces.forEach(iface => {
            const option = document.createElement('option');
            option.value = iface.name;
            option.textContent = `${iface.name} (${iface.is_up ? 'UP' : 'DOWN'})`;
            select.appendChild(option);
        });
    } catch (error) {
        showMessage('加载网络接口失败', 'error');
    }
}

// 加载PTP配置
async function loadPtpConfig() {
    try {
        const data = await apiCall('/api/ptp-config');
        currentConfig = data.global || {};
        
        // 填充表单
        document.getElementById('ptpDomain').value = currentConfig.domainNumber || 127;
        document.getElementById('priority1').value = currentConfig.priority1 || 128;
        document.getElementById('priority2').value = currentConfig.priority2 || 128;
        document.getElementById('logAnnounceInterval').value = currentConfig.logAnnounceInterval || 0;
        document.getElementById('announceReceiptTimeout').value = currentConfig.announceReceiptTimeout || 6;
        document.getElementById('logSyncInterval').value = currentConfig.logSyncInterval || -3;
        document.getElementById('syncReceiptTimeout').value = currentConfig.syncReceiptTimeout || 6;
    } catch (error) {
        showMessage('加载PTP配置失败', 'error');
    }
}

// 更新系统同步状态
async function updateSyncStatus() {
    try {
        const data = await apiCall('/api/clock-sync-mode');
        
        document.getElementById('currentSyncMode').textContent = data.mode || '-';
        
        // 更新时钟锁定状态
        const lockStatus = data.phc2sys_running ? '正常' : '未运行';
        document.getElementById('lockStatus').textContent = lockStatus;
        
        // 更新时钟源
        if (data.current_clock_source) {
            document.getElementById('currentClockSource').textContent = data.current_clock_source;
        }
        
        // 如果PTP模式，获取更多状态信息
        if (data.mode === 'PTP') {
            await updatePtpStatus();
        }
    } catch (error) {
        showMessage('更新同步状态失败', 'error');
    }
}

// 更新PTP状态
async function updatePtpStatus() {
    try {
        // 获取时间状态
        const timeStatus = await apiCall('/api/ptp-timestatus');
        document.getElementById('gmIdentity').textContent = timeStatus.gmIdentity || '-';
        document.getElementById('offsetFromMaster').textContent = 
            timeStatus.master_offset ? `${timeStatus.master_offset} ns` : '-';
        
        // 获取端口状态
        const portStatus = await apiCall('/api/ptp-port-status');
        document.getElementById('portState').textContent = portStatus.portState || '-';
        document.getElementById('ptpGmIdentity').textContent = portStatus.portIdentity || '-';
        
        // 获取当前时间数据
        const currentData = await apiCall('/api/ptp-currenttimedata');
        document.getElementById('meanPathDelay').textContent = 
            currentData.meanPathDelay ? `${currentData.meanPathDelay} ns` : '-';
        document.getElementById('ptpMeanPathDelay').textContent = 
            currentData.meanPathDelay ? `${currentData.meanPathDelay} ns` : '-';
        document.getElementById('ptpOffsetFromMaster').textContent = 
            currentData.offsetFromMaster ? `${currentData.offsetFromMaster} ns` : '-';
        
        // 更新锁定状态
        const isLocked = timeStatus.gmPresent === 'true';
        document.getElementById('ptpLockStatus').textContent = isLocked ? '正常' : '未锁定';
        
    } catch (error) {
        showMessage('更新PTP状态失败', 'error');
    }
}

// 设置同步方式
async function setSyncMode() {
    const mode = document.getElementById('syncMode').value;
    
    try {
        showLoading();
        const data = await apiCall('/api/clock-sync-mode', {
            method: 'PUT',
            body: JSON.stringify({ mode })
        });
        
        showMessage(`同步方式已设置为: ${mode}`, 'success');
        await updateSyncStatus();
    } catch (error) {
        showMessage('设置同步方式失败', 'error');
    } finally {
        hideLoading();
    }
}

// 更新PTP配置
async function updatePtpConfig() {
    const config = {
        key: 'domainNumber',
        value: document.getElementById('ptpDomain').value
    };
    
    try {
        showLoading();
        
        // 更新各个配置项
        const configs = [
            { key: 'domainNumber', value: document.getElementById('ptpDomain').value },
            { key: 'priority1', value: document.getElementById('priority1').value },
            { key: 'priority2', value: document.getElementById('priority2').value },
            { key: 'logAnnounceInterval', value: document.getElementById('logAnnounceInterval').value },
            { key: 'announceReceiptTimeout', value: document.getElementById('announceReceiptTimeout').value },
            { key: 'logSyncInterval', value: document.getElementById('logSyncInterval').value },
            { key: 'syncReceiptTimeout', value: document.getElementById('syncReceiptTimeout').value }
        ];
        
        for (const config of configs) {
            await apiCall('/api/ptp-config', {
                method: 'PUT',
                body: JSON.stringify(config)
            });
        }
        
        showMessage('PTP配置已更新', 'success');
        await loadPtpConfig();
        await updatePtpStatus();
    } catch (error) {
        showMessage('更新PTP配置失败', 'error');
    } finally {
        hideLoading();
    }
}

// 更新网络接口配置
async function updateNetworkInterfaces() {
    const select = document.getElementById('networkPorts');
    const selectedInterfaces = Array.from(select.selectedOptions).map(option => option.value);
    
    if (selectedInterfaces.length === 0) {
        showMessage('请选择至少一个网络接口', 'error');
        return;
    }
    
    try {
        showLoading();
        const data = await apiCall('/api/ptp4l-service-interface', {
            method: 'PUT',
            body: JSON.stringify({
                interfaces: selectedInterfaces
            })
        });
        
        showMessage('网络接口配置已更新', 'success');
        document.getElementById('currentPorts').textContent = selectedInterfaces.join(', ');
    } catch (error) {
        showMessage('更新网络接口配置失败', 'error');
    } finally {
        hideLoading();
    }
}

// 初始化应用
async function initApp() {
    try {
        showLoading();
        
        // 并行加载数据
        await Promise.all([
            loadNetworkInterfaces(),
            loadPtpConfig(),
            updateSyncStatus()
        ]);
        
        showMessage('应用初始化完成', 'success');
    } catch (error) {
        showMessage('应用初始化失败', 'error');
    } finally {
        hideLoading();
    }
}

// 定期更新状态
function startStatusUpdates() {
    setInterval(async () => {
        try {
            await updateSyncStatus();
        } catch (error) {
            console.error('状态更新失败:', error);
        }
    }, 5000); // 每5秒更新一次
}

// 事件监听器
document.addEventListener('DOMContentLoaded', () => {
    // 初始化应用
    initApp();
    
    // 启动状态更新
    startStatusUpdates();
    
    // 绑定按钮事件
    document.getElementById('submitSyncMode').addEventListener('click', setSyncMode);
    document.getElementById('submitPtpConfig').addEventListener('click', updatePtpConfig);
    
    // 网络接口选择变化时更新显示
    document.getElementById('networkPorts').addEventListener('change', () => {
        const select = document.getElementById('networkPorts');
        const selectedInterfaces = Array.from(select.selectedOptions).map(option => option.value);
        document.getElementById('currentPorts').textContent = selectedInterfaces.join(', ') || '-';
    });
    
    // 同步方式变化时更新状态
    document.getElementById('syncMode').addEventListener('change', updateSyncStatus);
});

// 错误处理
window.addEventListener('error', (event) => {
    console.error('全局错误:', event.error);
    showMessage('发生未知错误', 'error');
});

// 网络状态检测
window.addEventListener('online', () => {
    showMessage('网络连接已恢复', 'success');
});

window.addEventListener('offline', () => {
    showMessage('网络连接已断开', 'error');
}); 