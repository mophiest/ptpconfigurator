// API基础URL
const API_BASE_URL = 'http://localhost:8001';

// 全局变量
let networkInterfaces = [];
let currentConfig = {};
let statusUpdateInterval;
let originalPtp1Config = {};
let originalPtp2Config = {};

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// 初始化应用
async function initializeApp() {
    showLoading();
    
    try {
        // 加载网络接口
        await loadNetworkInterfaces();
        
        // 加载同步模式
        await loadSyncMode();
        
        // 根据当前同步模式控制PTP状态项的显示/隐藏
        const syncModeResponse = await fetch('/api/clock-sync-mode');
        const syncModeData = await syncModeResponse.json();
        if (syncModeData.success) {
            togglePtpStatusVisibility(syncModeData.mode);
        }
        
        // 加载PTP配置
        await loadPtpConfig();
        await loadPtpConfig2();
        
        // 加载PTP状态
        await loadPtpStatus();
        await loadPtpStatus2();
        
        // 绑定事件监听器
        bindEventListeners();
        
        // 开始状态更新
        startStatusUpdates();
        
        hideLoading();
    } catch (error) {
        console.error('初始化失败:', error);
        hideLoading();
        showMessage('初始化失败: ' + error.message, 'error');
    }
}

// 绑定事件监听器
function bindEventListeners() {
    // 系统同步模式
    document.getElementById('submitSyncMode').addEventListener('click', submitSyncMode);
    
    // PTP时钟1配置
    document.getElementById('submitPtpConfig').addEventListener('click', submitPtpConfig);
    
    // PTP时钟2配置
    document.getElementById('submitPtpConfig2').addEventListener('click', submitPtpConfig2);
}

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

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // 3秒后自动移除
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
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

// 加载网络接口
async function loadNetworkInterfaces() {
    try {
        const response = await fetch('/api/network-interfaces');
        const data = await response.json();
        
        if (data.interfaces) {
            networkInterfaces = data.interfaces;
            // 先更新选择框选项
            updateNetworkPortsSelect();
            // 然后加载PTP时钟1的当前网络接口
            await loadPtp1CurrentInterface();
            // 最后加载PTP时钟2的当前网络接口
            await loadPtp2CurrentInterface();
        } else {
            showNotification('加载网络接口失败: 返回数据格式错误', 'error');
        }
    } catch (error) {
        showNotification('加载网络接口失败: ' + error.message, 'error');
    }
}

// 加载PTP时钟1的当前网络接口
async function loadPtp1CurrentInterface() {
    try {
        const response = await fetch('/api/systemd/service-interfaces/ptp4l.service');
        const data = await response.json();
        
        if (data.success && data.interfaces.length > 0) {
            // 设置当前配置的网络接口
            const select = document.getElementById('networkPorts');
            select.value = data.interfaces[0]; // 使用第一个接口
        }
    } catch (error) {
        console.error('加载PTP时钟1网络接口失败:', error);
    }
}

// 加载PTP时钟2的当前网络接口
async function loadPtp2CurrentInterface() {
    try {
        const response = await fetch('/api/systemd/service-interfaces/ptp4l1.service');
        const data = await response.json();
        
        if (data.success && data.interfaces.length > 0) {
            // 设置当前配置的网络接口
            const select = document.getElementById('networkPorts2');
            select.value = data.interfaces[0]; // 使用第一个接口
        }
    } catch (error) {
        console.error('加载PTP时钟2网络接口失败:', error);
    }
}

// 更新网络端口选择框
function updateNetworkPortsSelect() {
    const select1 = document.getElementById('networkPorts');
    const select2 = document.getElementById('networkPorts2');
    
    // 清空现有选项
    select1.innerHTML = '';
    select2.innerHTML = '';
    
    // 添加网络接口选项
    networkInterfaces.forEach(iface => {
        const option1 = document.createElement('option');
        option1.value = iface.name; // 使用接口名称
        option1.textContent = `${iface.name} (${iface.ip || '无IP'})`;
        select1.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = iface.name; // 使用接口名称
        option2.textContent = `${iface.name} (${iface.ip || '无IP'})`;
        select2.appendChild(option2);
    });
}

// 加载系统同步模式
async function loadSyncMode() {
    try {
        const response = await fetch('/api/clock-sync-mode');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('syncMode').value = data.mode;
        } else {
            showNotification('加载同步模式失败: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('加载同步模式失败: ' + error.message, 'error');
    }
}

// 提交系统同步模式
async function submitSyncMode() {
    const mode = document.getElementById('syncMode').value;
    
    try {
        const response = await fetch('/api/clock-sync-mode', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mode: mode })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('同步模式设置成功', 'success');
            // 根据新的同步模式控制PTP状态项的显示/隐藏
            togglePtpStatusVisibility(mode);
            updateSystemStatus();
        } else {
            showNotification('同步模式设置失败: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('同步模式设置失败: ' + error.message, 'error');
    }
}

// 加载PTP时钟1配置
async function loadPtpConfig() {
    try {
        const response = await fetch('/api/ptp-config?config_file=/etc/linuxptp/ptp4l.conf');
        const data = await response.json();
        
        if (data.success) {
            const config = data.config;
            
            // 获取网络接口信息
            const interfaceResponse = await fetch('/api/systemd/service-interfaces/ptp4l.service');
            const interfaceData = await interfaceResponse.json();
            
            const interfaces = interfaceData.success ? interfaceData.interfaces : [];
            
            // 保存原始配置（包含网络接口）
            originalPtp1Config = JSON.parse(JSON.stringify({
                ...config,
                interfaces: interfaces
            }));
            
            document.getElementById('ptpDomain').value = config.domainNumber || 127;
            document.getElementById('priority1').value = config.priority1 || 128;
            document.getElementById('priority2').value = config.priority2 || 128;
            document.getElementById('logAnnounceInterval').value = config.logAnnounceInterval || 0;
            document.getElementById('announceReceiptTimeout').value = config.announceReceiptTimeout || 6;
            document.getElementById('logSyncInterval').value = config.logSyncInterval || -3;
            document.getElementById('syncReceiptTimeout').value = config.syncReceiptTimeout || 6;
            
            // 设置选中的网络端口（单选）
            const select = document.getElementById('networkPorts');
            if (interfaces && interfaces.length > 0) {
                select.value = interfaces[0]; // 使用第一个接口
            }
        } else {
            showNotification('加载PTP配置失败: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('加载PTP配置失败: ' + error.message, 'error');
    }
}

// 加载PTP时钟2配置
async function loadPtpConfig2() {
    try {
        const response = await fetch('/api/ptp-config?config_file=/etc/linuxptp/ptp4l1.conf');
        const data = await response.json();
        
        if (data.success) {
            const config = data.config;
            
            // 获取网络接口信息
            const interfaceResponse = await fetch('/api/systemd/service-interfaces/ptp4l1.service');
            const interfaceData = await interfaceResponse.json();
            
            const interfaces = interfaceData.success ? interfaceData.interfaces : [];
            
            // 保存原始配置（包含网络接口）
            originalPtp2Config = JSON.parse(JSON.stringify({
                ...config,
                interfaces: interfaces
            }));
            
            document.getElementById('ptpDomain2').value = config.domainNumber || 127;
            document.getElementById('priority1_2').value = config.priority1 || 128;
            document.getElementById('priority2_2').value = config.priority2 || 128;
            document.getElementById('logAnnounceInterval2').value = config.logAnnounceInterval || 0;
            document.getElementById('announceReceiptTimeout2').value = config.announceReceiptTimeout || 6;
            document.getElementById('logSyncInterval2').value = config.logSyncInterval || -3;
            document.getElementById('syncReceiptTimeout2').value = config.syncReceiptTimeout || 6;
            
            // 设置选中的网络端口（单选）
            const select = document.getElementById('networkPorts2');
            if (interfaces && interfaces.length > 0) {
                select.value = interfaces[0]; // 使用第一个接口
            }
        } else {
            showNotification('加载PTP时钟2配置失败: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('加载PTP时钟2配置失败: ' + error.message, 'error');
    }
}

// 加载PTP时钟1状态
async function loadPtpStatus() {
    try {
        // 获取时间状态
        const timeStatusResponse = await fetch('/api/ptp-timestatus?uds_path=/var/run/ptp4l');
        const timeStatusData = await timeStatusResponse.json();
        
        if (timeStatusData.success) {
            document.getElementById('ptpGmIdentity').textContent = timeStatusData.gmIdentity || 'Unknown';
            
            // 根据GM状态设置锁定状态
            const isLocked = timeStatusData.gmPresent === 'true';
            const lockStatus = isLocked ? '已锁定' : '未锁定';
            const lockClass = isLocked ? 'status-locked' : 'status-unlocked';
            
            document.getElementById('ptpLockStatus').textContent = lockStatus;
            document.getElementById('ptpLockStatus').className = 'status-value ' + lockClass;
        }
        
        // 获取端口状态
        const portResponse = await fetch('/api/ptp-port-status?uds_path=/var/run/ptp4l');
        const portData = await portResponse.json();
        
        if (portData.success) {
            const portState = portData.portState || 'Unknown';
            const portStateElement = document.getElementById('portState');
            portStateElement.textContent = portState;
            
            // 根据端口状态设置颜色
            if (portState === 'SLAVE' || portState === 'MASTER') {
                portStateElement.className = 'status-value status-locked';
            } else if (portState === 'FAULTY' || portState === 'LISTENING' || portState === 'UNCALIBRATED') {
                portStateElement.className = 'status-value status-unlocked';
            } else {
                portStateElement.className = 'status-value';
            }
        }
        
        // 获取当前时间数据
        const timeResponse = await fetch('/api/ptp-currenttimedata?uds_path=/var/run/ptp4l');
        const timeData = await timeResponse.json();
        
        if (timeData.success) {
            const offset = (timeData.offsetFromMaster !== undefined && timeData.offsetFromMaster !== null) ? timeData.offsetFromMaster : 'Unknown';
            const delay = (timeData.meanPathDelay !== undefined && timeData.meanPathDelay !== null) ? timeData.meanPathDelay : 'Unknown';
            
            document.getElementById('ptpOffsetFromMaster').textContent = offset;
            document.getElementById('ptpMeanPathDelay').textContent = delay;
        }
        
        // 获取当前配置的网络端口（从systemd服务文件获取）
        const interfaceResponse = await fetch('/api/systemd/service-interfaces/ptp4l.service');
        const interfaceData = await interfaceResponse.json();
        
        if (interfaceData.success && interfaceData.interfaces && interfaceData.interfaces.length > 0) {
            document.getElementById('currentPorts').textContent = interfaceData.interfaces.join(', ');
        } else {
            document.getElementById('currentPorts').textContent = 'Unknown';
        }
        
    } catch (error) {
        console.error('加载PTP时钟1状态失败:', error);
    }
}

// 加载PTP时钟2状态
async function loadPtpStatus2() {
    try {
        // 获取时间状态
        const timeStatusResponse = await fetch('/api/ptp-timestatus?uds_path=/var/run/ptp4l1');
        const timeStatusData = await timeStatusResponse.json();
        
        if (timeStatusData.success) {
            document.getElementById('ptpGmIdentity2').textContent = timeStatusData.gmIdentity || 'Unknown';
            
            // 根据GM状态设置锁定状态
            const isLocked = timeStatusData.gmPresent === 'true';
            const lockStatus = isLocked ? '已锁定' : '未锁定';
            const lockClass = isLocked ? 'status-locked' : 'status-unlocked';
            
            document.getElementById('ptpLockStatus2').textContent = lockStatus;
            document.getElementById('ptpLockStatus2').className = 'status-value ' + lockClass;
        }
        
        // 获取端口状态
        const portResponse = await fetch('/api/ptp-port-status?uds_path=/var/run/ptp4l1');
        const portData = await portResponse.json();
        
        if (portData.success) {
            const portState = portData.portState || 'Unknown';
            const portStateElement = document.getElementById('portState2');
            portStateElement.textContent = portState;
            
            // 根据端口状态设置颜色
            if (portState === 'SLAVE' || portState === 'MASTER') {
                portStateElement.className = 'status-value status-locked';
            } else if (portState === 'FAULTY' || portState === 'LISTENING' || portState === 'UNCALIBRATED') {
                portStateElement.className = 'status-value status-unlocked';
            } else {
                portStateElement.className = 'status-value';
            }
        }
        
        // 获取当前时间数据
        const timeResponse = await fetch('/api/ptp-currenttimedata?uds_path=/var/run/ptp4l1');
        const timeData = await timeResponse.json();
        
        if (timeData.success) {
            const offset = (timeData.offsetFromMaster !== undefined && timeData.offsetFromMaster !== null) ? timeData.offsetFromMaster : 'Unknown';
            const delay = (timeData.meanPathDelay !== undefined && timeData.meanPathDelay !== null) ? timeData.meanPathDelay : 'Unknown';
            
            document.getElementById('ptpOffsetFromMaster2').textContent = offset;
            document.getElementById('ptpMeanPathDelay2').textContent = delay;
        }
        
        // 获取当前配置的网络端口（从systemd服务文件获取）
        const interfaceResponse = await fetch('/api/systemd/service-interfaces/ptp4l1.service');
        const interfaceData = await interfaceResponse.json();
        
        if (interfaceData.success && interfaceData.interfaces && interfaceData.interfaces.length > 0) {
            document.getElementById('currentPorts2').textContent = interfaceData.interfaces.join(', ');
        } else {
            document.getElementById('currentPorts2').textContent = 'Unknown';
        }
        
    } catch (error) {
        console.error('加载PTP时钟2状态失败:', error);
    }
}

// 检查配置是否有变化
function hasConfigChanged(originalConfig, newConfig) {
    const keysToCheck = ['domain', 'priority1', 'priority2', 'logAnnounceInterval', 
                        'announceReceiptTimeout', 'logSyncInterval', 'syncReceiptTimeout', 'interfaces'];
    
    for (const key of keysToCheck) {
        if (key === 'interfaces') {
            const originalInterfaces = originalConfig[key] || [];
            const newInterfaces = newConfig[key] || [];
            if (JSON.stringify(originalInterfaces.sort()) !== JSON.stringify(newInterfaces.sort())) {
                return true;
            }
        } else {
            if (originalConfig[key] !== newConfig[key]) {
                return true;
            }
        }
    }
    return false;
}

// 提交PTP时钟1配置
async function submitPtpConfig() {
    const newConfig = {
        config_file: '/etc/linuxptp/ptp4l.conf',
        domain: parseInt(document.getElementById('ptpDomain').value),
        priority1: parseInt(document.getElementById('priority1').value),
        priority2: parseInt(document.getElementById('priority2').value),
        logAnnounceInterval: parseInt(document.getElementById('logAnnounceInterval').value),
        announceReceiptTimeout: parseInt(document.getElementById('announceReceiptTimeout').value),
        logSyncInterval: parseInt(document.getElementById('logSyncInterval').value),
        syncReceiptTimeout: parseInt(document.getElementById('syncReceiptTimeout').value)
    };
    
    const newInterfaces = [document.getElementById('networkPorts').value]; // 单选，转换为数组
    
    try {
        // 检查配置是否有变化
        const configChanged = hasConfigChanged(originalPtp1Config, newConfig);
        const interfacesChanged = JSON.stringify(originalPtp1Config.interfaces || []) !== JSON.stringify(newInterfaces);
        
        if (!configChanged && !interfacesChanged) {
            showNotification('PTP时钟1配置未发生变化', 'info');
            return;
        }
        
        let success = true;
        
        // 更新配置文件
        if (configChanged) {
            const response = await fetch('/api/ptp-config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newConfig)
            });
            
            const data = await response.json();
            
            if (!data.success) {
                showNotification('PTP时钟1配置文件更新失败: ' + data.error, 'error');
                return;
            }
        }
        
        // 更新网络接口
        if (interfacesChanged) {
            const interfaceResponse = await fetch('/api/ptp4l-service-interface', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    interfaces: newInterfaces,
                    service_name: 'ptp4l.service'
                })
            });
            
            const interfaceData = await interfaceResponse.json();
            
            if (interfaceData.status !== 'success') {
                showNotification('PTP时钟1网络接口更新失败: ' + interfaceData.message, 'error');
                return;
            }
        }
        
        // 检查是否需要reload systemd
        const needsReload = configChanged || interfacesChanged;
        
        if (needsReload) {
            // 先reload systemd
            const reloadResponse = await fetch('/api/systemd/reload', { method: 'POST' });
            const reloadData = await reloadResponse.json();
            
            if (!reloadData.success) {
                showNotification('Systemd reload失败: ' + reloadData.error, 'error');
                return;
            }
        }
        
        // 重启ptp4l.service
        const restartResponse = await fetch('/api/systemd/restart-service', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ service_name: 'ptp4l.service' })
        });
        
        const restartData = await restartResponse.json();
        
        if (restartData.success) {
            showNotification('PTP时钟1配置更新成功，服务已重启', 'success');
            // 更新原始配置
            originalPtp1Config = JSON.parse(JSON.stringify({...newConfig, interfaces: newInterfaces}));
            // 重新加载状态
            setTimeout(() => {
                loadPtpStatus();
            }, 2000);
        } else {
            showNotification('PTP时钟1服务重启失败: ' + restartData.error, 'error');
        }
    } catch (error) {
        showNotification('PTP时钟1配置更新失败: ' + error.message, 'error');
    }
}

// 提交PTP时钟2配置
async function submitPtpConfig2() {
    const newConfig = {
        config_file: '/etc/linuxptp/ptp4l1.conf',
        domain: parseInt(document.getElementById('ptpDomain2').value),
        priority1: parseInt(document.getElementById('priority1_2').value),
        priority2: parseInt(document.getElementById('priority2_2').value),
        logAnnounceInterval: parseInt(document.getElementById('logAnnounceInterval2').value),
        announceReceiptTimeout: parseInt(document.getElementById('announceReceiptTimeout2').value),
        logSyncInterval: parseInt(document.getElementById('logSyncInterval2').value),
        syncReceiptTimeout: parseInt(document.getElementById('syncReceiptTimeout2').value)
    };
    
    const newInterfaces = [document.getElementById('networkPorts2').value]; // 单选，转换为数组
    
    try {
        // 检查配置是否有变化
        const configChanged = hasConfigChanged(originalPtp2Config, newConfig);
        const interfacesChanged = JSON.stringify(originalPtp2Config.interfaces || []) !== JSON.stringify(newInterfaces);
        
        if (!configChanged && !interfacesChanged) {
            showNotification('PTP时钟2配置未发生变化', 'info');
            return;
        }
        
        let success = true;
        
        // 更新配置文件
        if (configChanged) {
            const response = await fetch('/api/ptp-config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newConfig)
            });
            
            const data = await response.json();
            
            if (!data.success) {
                showNotification('PTP时钟2配置文件更新失败: ' + data.error, 'error');
                return;
            }
        }
        
        // 更新网络接口
        if (interfacesChanged) {
            const interfaceResponse = await fetch('/api/ptp4l-service-interface', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    interfaces: newInterfaces,
                    service_name: 'ptp4l1.service'
                })
            });
            
            const interfaceData = await interfaceResponse.json();
            
            if (interfaceData.status !== 'success') {
                showNotification('PTP时钟2网络接口更新失败: ' + interfaceData.message, 'error');
                return;
            }
        }
        
        // 检查是否需要reload systemd
        const needsReload = configChanged || interfacesChanged;
        
        if (needsReload) {
            // 先reload systemd
            const reloadResponse = await fetch('/api/systemd/reload', { method: 'POST' });
            const reloadData = await reloadResponse.json();
            
            if (!reloadData.success) {
                showNotification('Systemd reload失败: ' + reloadData.error, 'error');
                return;
            }
        }
        
        // 重启ptp4l1.service
        const restartResponse = await fetch('/api/systemd/restart-service', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ service_name: 'ptp4l1.service' })
        });
        
        const restartData = await restartResponse.json();
        
        if (restartData.success) {
            showNotification('PTP时钟2配置更新成功，服务已重启', 'success');
            // 更新原始配置
            originalPtp2Config = JSON.parse(JSON.stringify({...newConfig, interfaces: newInterfaces}));
            // 重新加载状态
            setTimeout(() => {
                loadPtpStatus2();
            }, 2000);
        } else {
            showNotification('PTP时钟2服务重启失败: ' + restartData.error, 'error');
        }
    } catch (error) {
        showNotification('PTP时钟2配置更新失败: ' + error.message, 'error');
    }
}

// 开始状态更新
function startStatusUpdates() {
    updateSystemStatus();
    updatePtpStatus();
    updatePtpStatus2();
    
    // 每1秒更新一次状态
    statusUpdateInterval = setInterval(() => {
        updateSystemStatus();
        updatePtpStatus();
        updatePtpStatus2();
    }, 1000);
}

// 根据同步模式控制PTP状态项的显示/隐藏
function togglePtpStatusVisibility(syncMode) {
    const ptpStatusItems = [
        'lockStatus',
        'gmIdentity', 
        'meanPathDelay',
        'offsetFromMaster'
    ];
    
    const shouldShow = syncMode === 'PTP';
    
    ptpStatusItems.forEach(itemId => {
        const element = document.getElementById(itemId);
        if (element) {
            const statusItem = element.closest('.status-item');
            if (statusItem) {
                statusItem.style.display = shouldShow ? 'flex' : 'none';
            }
        }
    });
}

// 更新系统状态
async function updateSystemStatus() {
    try {
        const response = await fetch('/api/clock-sync-mode');
        const data = await response.json();
        
        if (data.success) {
            const statusElement = document.getElementById('currentSyncMode');
            const mode = data.mode;
            
            let statusText = '';
            let statusClass = '';
            
            switch (mode) {
                case 'internal':
                    statusText = '内部时钟同步';
                    statusClass = 'status-internal';
                    break;
                case 'BB':
                    statusText = 'BB时钟同步';
                    statusClass = 'status-bb';
                    break;
                case 'PTP':
                    statusText = 'PTP时钟同步';
                    statusClass = 'status-ptp';
                    break;
                default:
                    statusText = '未知状态';
                    statusClass = 'status-unknown';
            }
            
            statusElement.textContent = statusText;
            statusElement.className = 'status-value ' + statusClass;
            
            // 根据同步模式控制PTP状态项的显示/隐藏
            togglePtpStatusVisibility(mode);
            
            // 根据同步模式设置当前系统时钟源和PTP状态信息
            const clockSourceElement = document.getElementById('currentClockSource');
            if (clockSourceElement) {
                if (mode === 'PTP') {
                    // PTP模式：获取实际的时钟源信息
                    const clockSourceResponse = await fetch('/api/clock-source-state');
                    const clockSourceData = await clockSourceResponse.json();
                    
                    if (clockSourceData.current_source) {
                        clockSourceElement.textContent = clockSourceData.current_source;
                    }
                    
                    // 根据时钟源状态设置锁定状态
                    const lockStatusElement = document.getElementById('lockStatus');
                    if (lockStatusElement) {
                        if (clockSourceData.status === 'normal' && clockSourceData.current_source && clockSourceData.current_source !== 'noClockAvailable') {
                            // phc2sys正在使用PTP时钟源，显示已锁定
                            lockStatusElement.textContent = '已锁定';
                            lockStatusElement.className = 'status-value status-locked';
                        } else if (clockSourceData.status === 'failed' || clockSourceData.status === 'timeout' || clockSourceData.current_source === 'noClockAvailable') {
                            // phc2sys无法找到PTP时钟源，自动转入内同步
                            lockStatusElement.textContent = '未锁定（自动转入内同步）';
                            lockStatusElement.className = 'status-value status-unlocked';
                        } else {
                            // 其他情况
                            lockStatusElement.textContent = '未知';
                            lockStatusElement.className = 'status-value';
                        }
                    }
                    
                    // 获取PTP状态信息并更新系统同步状态区域
                    try {
                        // 获取时间状态（包含GM Identity）
                        const timeStatusResponse = await fetch('/api/ptp-timestatus?uds_path=/var/run/ptp4l');
                        const timeStatusData = await timeStatusResponse.json();
                        
                        if (timeStatusData.success) {
                            const gmIdentityElement = document.getElementById('gmIdentity');
                            if (gmIdentityElement) {
                                gmIdentityElement.textContent = timeStatusData.gmIdentity || 'Unknown';
                            }
                        }
                        
                        // 获取当前时间数据
                        const timeResponse = await fetch('/api/ptp-currenttimedata?uds_path=/var/run/ptp4l');
                        const timeData = await timeResponse.json();
                        
                        if (timeData.success) {
                            const offsetElement = document.getElementById('offsetFromMaster');
                            const delayElement = document.getElementById('meanPathDelay');
                            
                            if (offsetElement) {
                                offsetElement.textContent = (timeData.offsetFromMaster !== undefined && timeData.offsetFromMaster !== null) ? timeData.offsetFromMaster : 'Unknown';
                            }
                            if (delayElement) {
                                delayElement.textContent = (timeData.meanPathDelay !== undefined && timeData.meanPathDelay !== null) ? timeData.meanPathDelay : 'Unknown';
                            }
                        }
                    } catch (error) {
                        console.error('获取PTP状态信息失败:', error);
                    }
                } else {
                    // BB或内部模式：显示本地内部时钟
                    clockSourceElement.textContent = '本地内部时钟';
                    
                    // 清空PTP相关状态
                    const gmIdentityElement = document.getElementById('gmIdentity');
                    const lockStatusElement = document.getElementById('lockStatus');
                    const offsetElement = document.getElementById('offsetFromMaster');
                    const delayElement = document.getElementById('meanPathDelay');
                    
                    if (gmIdentityElement) gmIdentityElement.textContent = '-';
                    if (lockStatusElement) {
                        lockStatusElement.textContent = '-';
                        lockStatusElement.className = 'status-value';
                    }
                    if (offsetElement) offsetElement.textContent = '-';
                    if (delayElement) delayElement.textContent = '-';
                }
            }
        }
    } catch (error) {
        console.error('更新系统状态失败:', error);
    }
}

// 更新PTP时钟1状态
async function updatePtpStatus() {
    try {
        // 获取时间状态（包含GM Identity）
        const timeStatusResponse = await fetch('/api/ptp-timestatus?uds_path=/var/run/ptp4l');
        const timeStatusData = await timeStatusResponse.json();
        
        if (timeStatusData.success) {
            const gmIdentity = timeStatusData.gmIdentity || 'Unknown';
            document.getElementById('ptpGmIdentity').textContent = gmIdentity;
            
            // 根据GM状态设置锁定状态
            const isLocked = timeStatusData.gmPresent === 'true';
            const lockStatus = isLocked ? '已锁定' : '未锁定';
            const lockClass = isLocked ? 'status-locked' : 'status-unlocked';
            
            document.getElementById('ptpLockStatus').textContent = lockStatus;
            document.getElementById('ptpLockStatus').className = 'status-value ' + lockClass;
        }
        
        // 获取端口状态
        const portResponse = await fetch('/api/ptp-port-status?uds_path=/var/run/ptp4l');
        const portData = await portResponse.json();
        
        if (portData.success) {
            const portState = portData.portState || 'Unknown';
            const portStateElement = document.getElementById('portState');
            portStateElement.textContent = portState;
            
            // 根据端口状态设置颜色
            if (portState === 'SLAVE' || portState === 'MASTER') {
                portStateElement.className = 'status-value status-locked';
            } else if (portState === 'FAULTY' || portState === 'LISTENING' || portState === 'UNCALIBRATED') {
                portStateElement.className = 'status-value status-unlocked';
            } else {
                portStateElement.className = 'status-value';
            }
        }
        
        // 获取当前时间数据
        const timeResponse = await fetch('/api/ptp-currenttimedata?uds_path=/var/run/ptp4l');
        const timeData = await timeResponse.json();
        
        if (timeData.success) {
            const offset = (timeData.offsetFromMaster !== undefined && timeData.offsetFromMaster !== null) ? timeData.offsetFromMaster : 'Unknown';
            const delay = (timeData.meanPathDelay !== undefined && timeData.meanPathDelay !== null) ? timeData.meanPathDelay : 'Unknown';
            
            document.getElementById('ptpOffsetFromMaster').textContent = offset;
            document.getElementById('ptpMeanPathDelay').textContent = delay;
        }
    } catch (error) {
        console.error('更新PTP时钟1状态失败:', error);
    }
}

// 更新PTP时钟2状态
async function updatePtpStatus2() {
    try {
        // 获取时间状态（包含GM Identity）
        const timeStatusResponse = await fetch('/api/ptp-timestatus?uds_path=/var/run/ptp4l1');
        const timeStatusData = await timeStatusResponse.json();
        
        if (timeStatusData.success) {
            const gmIdentity = timeStatusData.gmIdentity || 'Unknown';
            document.getElementById('ptpGmIdentity2').textContent = gmIdentity;
            
            // 根据GM状态设置锁定状态
            const isLocked = timeStatusData.gmPresent === 'true';
            const lockStatus = isLocked ? '已锁定' : '未锁定';
            const lockClass = isLocked ? 'status-locked' : 'status-unlocked';
            
            document.getElementById('ptpLockStatus2').textContent = lockStatus;
            document.getElementById('ptpLockStatus2').className = 'status-value ' + lockClass;
        }
        
        // 获取端口状态
        const portResponse = await fetch('/api/ptp-port-status?uds_path=/var/run/ptp4l1');
        const portData = await portResponse.json();
        
        if (portData.success) {
            const portState = portData.portState || 'Unknown';
            const portStateElement = document.getElementById('portState2');
            portStateElement.textContent = portState;
            
            // 根据端口状态设置颜色
            if (portState === 'SLAVE' || portState === 'MASTER') {
                portStateElement.className = 'status-value status-locked';
            } else if (portState === 'FAULTY' || portState === 'LISTENING' || portState === 'UNCALIBRATED') {
                portStateElement.className = 'status-value status-unlocked';
            } else {
                portStateElement.className = 'status-value';
            }
        }
        
        // 获取当前时间数据
        const timeResponse = await fetch('/api/ptp-currenttimedata?uds_path=/var/run/ptp4l1');
        const timeData = await timeResponse.json();
        
        if (timeData.success) {
            const offset = (timeData.offsetFromMaster !== undefined && timeData.offsetFromMaster !== null) ? timeData.offsetFromMaster : 'Unknown';
            const delay = (timeData.meanPathDelay !== undefined && timeData.meanPathDelay !== null) ? timeData.meanPathDelay : 'Unknown';
            
            document.getElementById('ptpOffsetFromMaster2').textContent = offset;
            document.getElementById('ptpMeanPathDelay2').textContent = delay;
        }
    } catch (error) {
        console.error('更新PTP时钟2状态失败:', error);
    }
} 