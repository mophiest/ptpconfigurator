// API基础URL
const API_BASE_URL = 'http://localhost:8001';

// 全局变量
let networkInterfaces = [];
let currentConfig = {};
let statusUpdateInterval;
let originalPtp1Config = {};
let originalPtp2Config = {};

// 控制主路时钟选择的显示/隐藏 - 提前定义
window.togglePrimaryClockVisibility = function(mode) {
    console.log('togglePrimaryClockVisibility 被调用, mode:', mode);
    const primaryClockGroup = document.getElementById('primaryClockGroup');
    if (!primaryClockGroup) {
        console.error('找不到 primaryClockGroup 元素');
        return;
    }
    
    if (mode === 'PTP') {
        console.log('显示主路时钟选择框');
        primaryClockGroup.style.display = 'block';
    } else {
        console.log('隐藏主路时钟选择框');
        primaryClockGroup.style.display = 'none';
    }
};

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM加载完成，开始初始化应用...');
    initializeApp();
});

// 初始化应用
async function initializeApp() {
    showLoading();
    
    try {
        // 加载网络接口
        await loadNetworkInterfaces();
        
        // 加载同步模式（这里包含主路时钟显示逻辑）
        await loadSyncMode();
        
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
        
        // 最后再次检查和设置主路时钟显示状态
        setTimeout(async () => {
            console.log('=== 最终检查开始 ===');
            try {
                const response = await fetch('/api/clock-sync-mode');
                const data = await response.json();
                console.log('最终检查 - API响应:', data);
                
                if (data.success) {
                    console.log('最终检查 - 同步模式:', data.mode);
                    
                    // 检查DOM元素
                    const primaryClockGroup = document.getElementById('primaryClockGroup');
                    const syncModeSelect = document.getElementById('syncMode');
                    
                    console.log('最终检查 - primaryClockGroup存在:', !!primaryClockGroup);
                    console.log('最终检查 - syncModeSelect存在:', !!syncModeSelect);
                    
                    if (primaryClockGroup) {
                        console.log('最终检查 - 当前display样式:', primaryClockGroup.style.display);
                        
                        if (data.mode === 'PTP') {
                            primaryClockGroup.style.display = 'block';
                            console.log('最终检查 - 强制显示主路时钟选择框');
                            console.log('最终检查 - 设置后display样式:', primaryClockGroup.style.display);
                        } else {
                            primaryClockGroup.style.display = 'none';
                            console.log('最终检查 - 隐藏主路时钟选择框');
                        }
                        
                        // 确保同步模式选择框的值正确
                        if (syncModeSelect) {
                            syncModeSelect.value = data.mode;
                            console.log('最终检查 - 确保同步模式选择框值为:', data.mode);
                        }
                    } else {
                        console.error('最终检查 - 找不到 primaryClockGroup 元素');
                    }
                } else {
                    console.error('最终检查 - API返回失败:', data);
                }
            } catch (error) {
                console.error('最终检查失败:', error);
            }
            console.log('=== 最终检查结束 ===');
        }, 1000);
        
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
    
    // 为同步方式选择框添加change事件监听器
    const syncModeSelect = document.getElementById('syncMode');
    if (syncModeSelect) {
        syncModeSelect.addEventListener('change', function(e) {
            console.log('同步方式改变为:', e.target.value);
            window.togglePrimaryClockVisibility(e.target.value);
        });
        console.log('已绑定同步方式change事件');
    } else {
        console.error('找不到syncMode元素');
    }
    
    // PTP时钟1配置
    document.getElementById('submitPtpConfig').addEventListener('click', submitPtpConfig);
    
    // PTP时钟2配置
    document.getElementById('submitPtpConfig2').addEventListener('click', submitPtpConfig2);
    
    // PTP时钟1服务控制
    document.getElementById('startPtp1Service').addEventListener('click', () => controlPtpService('ptp4l.service', 'start'));
    document.getElementById('stopPtp1Service').addEventListener('click', () => controlPtpService('ptp4l.service', 'stop'));
    
    // PTP时钟2服务控制
    document.getElementById('startPtp2Service').addEventListener('click', () => controlPtpService('ptp4l1.service', 'start'));
    document.getElementById('stopPtp2Service').addEventListener('click', () => controlPtpService('ptp4l1.service', 'stop'));
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
            console.log('同步模式加载成功:', data.mode);
            
            // 设置下拉框值
            const syncModeSelect = document.getElementById('syncMode');
            if (syncModeSelect) {
                syncModeSelect.value = data.mode;
                console.log('已设置同步模式选择框值为:', data.mode);
            } else {
                console.error('找不到syncMode选择框');
            }
            
            // 立即调用显示控制函数
            console.log('立即调用主路时钟显示控制, 模式:', data.mode);
            window.togglePrimaryClockVisibility(data.mode);
            
            // 也调用PTP状态显示控制
            console.log('调用PTP状态显示控制, 模式:', data.mode);
            togglePtpStatusVisibility(data.mode);
            
            // 如果是PTP模式，加载主路时钟配置
            if (data.mode === 'PTP') {
                console.log('PTP模式，加载主路时钟配置');
                await loadPrimaryClockConfig();
            }
        } else {
            showNotification('加载同步模式失败: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('加载同步模式失败:', error);
        showNotification('加载同步模式失败: ' + error.message, 'error');
    }
}

// 加载主路时钟配置
async function loadPrimaryClockConfig() {
    try {
        const response = await fetch('/api/primary-clock');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('primaryClock').value = data.primary_clock || 'ptp1';
        }
    } catch (error) {
        console.error('加载主路时钟配置失败:', error);
        // 如果获取失败，设置默认值
        document.getElementById('primaryClock').value = 'ptp1';
    }
}

// 提交系统同步模式
async function submitSyncMode() {
    const mode = document.getElementById('syncMode').value;
    const primaryClock = document.getElementById('primaryClock').value;
    

    
    try {
        // 构建请求体，只有在PTP模式下才包含主路时钟
        const requestBody = { mode: mode };
        if (mode === 'PTP') {
            requestBody.primary_clock = primaryClock;
        }
        
        const response = await fetch('/api/clock-sync-mode', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('同步模式设置成功', 'success');
            // 根据新的同步模式控制PTP状态项和主路时钟选择的显示/隐藏
            togglePtpStatusVisibility(mode);
            window.togglePrimaryClockVisibility(mode);
            updateSystemStatus();
        } else {
            showNotification('同步模式设置失败: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('同步模式设置失败: ' + error.message, 'error');
    }
}

// 注意：togglePrimaryClockVisibility函数已移到文件开头定义

// 修改现有的切换PTP状态显示函数，同时控制主路时钟显示
function togglePtpStatusVisibility(mode) {
    const ptpSections = document.querySelectorAll('.config-section');
    const systemStatusItems = document.querySelectorAll('.status-item');
    
    // 隐藏所有PTP相关的状态项
    systemStatusItems.forEach(item => {
        const label = item.querySelector('.status-label').textContent;
        if (label.includes('GMID') || label.includes('链路延时') || label.includes('时间偏差')) {
            if (mode === 'PTP') {
                item.style.display = ''; // 使用空字符串恢复CSS默认样式
            } else {
                item.style.display = 'none';
            }
        }
    });
    
    // 控制主路时钟选择的显示
    window.togglePrimaryClockVisibility(mode);
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
    const keysToCheck = ['domainNumber', 'priority1', 'priority2', 'logAnnounceInterval', 
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
        domainNumber: parseInt(document.getElementById('ptpDomain').value),
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
        domainNumber: parseInt(document.getElementById('ptpDomain2').value),
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

// 获取PTP时钟1的当前配置
async function getPtp1Config() {
    try {
        const response = await fetch('/api/ptp-config?config_file=/etc/linuxptp/ptp4l.conf');
        const data = await response.json();
        return data.success ? data.config : null;
    } catch (error) {
        console.error('获取PTP时钟1配置失败:', error);
        return null;
    }
}

// 获取PTP时钟2的当前配置
async function getPtp2Config() {
    try {
        const response = await fetch('/api/ptp-config?config_file=/etc/linuxptp/ptp4l1.conf');
        const data = await response.json();
        return data.success ? data.config : null;
    } catch (error) {
        console.error('获取PTP时钟2配置失败:', error);
        return null;
    }
}

// 获取时钟源对应的PTP时钟映射
async function getClockSourceMapping() {
    try {
        // 获取PTP时钟1的网络接口
        const ptp1Response = await fetch('/api/systemd/service-interfaces/ptp4l.service');
        const ptp1Data = await ptp1Response.json();
        
        // 获取PTP时钟2的网络接口
        const ptp2Response = await fetch('/api/systemd/service-interfaces/ptp4l1.service');
        const ptp2Data = await ptp2Response.json();
        
        const mapping = {};
        
        // 建立映射关系
        if (ptp1Data.success && ptp1Data.interfaces) {
            ptp1Data.interfaces.forEach(iface => {
                mapping[iface] = '/var/run/ptp4l'; // PTP时钟1
            });
        }
        
        if (ptp2Data.success && ptp2Data.interfaces) {
            ptp2Data.interfaces.forEach(iface => {
                mapping[iface] = '/var/run/ptp4l1'; // PTP时钟2
            });
        }
        
        return mapping;
    } catch (error) {
        console.error('获取时钟源映射失败:', error);
        // 返回默认映射
        return {
            'ens102': '/var/run/ptp4l1', // PTP时钟2
            'ens104': '/var/run/ptp4l'   // PTP时钟1
        };
    }
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
                    // PTP模式：使用新的系统时钟状态API
                    const systemClockResponse = await fetch('/api/system-clock-status');
                    const systemClockData = await systemClockResponse.json();
                    
                    if (systemClockData.success) {
                        // 检查是否是PTP无效状态
                        if (systemClockData.status === 'ptp_invalid_internal') {
                            // PTP无效，自动转为内同步
                            clockSourceElement.textContent = '内部';
                            
                            const lockStatusElement = document.getElementById('lockStatus');
                            if (lockStatusElement) {
                                lockStatusElement.textContent = 'PTP无效，自动转为内同步';
                                lockStatusElement.className = 'status-value status-internal';
                            }
                            
                            // 清空PTP相关数据
                            const gmIdentityElement = document.getElementById('gmIdentity');
                            const offsetElement = document.getElementById('offsetFromMaster');
                            if (gmIdentityElement) gmIdentityElement.textContent = '-';
                            if (offsetElement) offsetElement.textContent = '-';
                        } else {
                            // 正常PTP状态
                            // 根据主路时钟显示对应的PTP时钟名称
                            const primaryClock = systemClockData.primary_clock;
                            let clockSourceText = 'PTP同步时钟';
                            if (primaryClock === 'ptp1') {
                                clockSourceText = 'PTP时钟1';
                            } else if (primaryClock === 'ptp2') {
                                clockSourceText = 'PTP时钟2';
                            }
                            clockSourceElement.textContent = clockSourceText;
                            
                            // 设置锁定状态
                            const lockStatusElement = document.getElementById('lockStatus');
                            if (lockStatusElement) {
                                if (systemClockData.locked) {
                                    lockStatusElement.textContent = '已锁定';
                                    lockStatusElement.className = 'status-value status-locked';
                                } else {
                                    let statusText = '未锁定';
                                    if (systemClockData.status === 'no_logs') {
                                        statusText = '未锁定（无日志）';
                                    } else if (systemClockData.status === 'no_sync_data') {
                                        statusText = '未锁定（无同步数据）';
                                    } else if (systemClockData.status === 'service_error') {
                                        statusText = '未锁定（服务错误）';
                                    }
                                    lockStatusElement.textContent = statusText;
                                    lockStatusElement.className = 'status-value status-unlocked';
                                }
                            }
                            
                            // 更新时间偏差为从日志获取的offset
                            const offsetElement = document.getElementById('offsetFromMaster');
                            if (offsetElement) {
                                if (systemClockData.offset !== null && systemClockData.offset !== undefined) {
                                    offsetElement.textContent = systemClockData.offset + ' ns';
                                } else {
                                    offsetElement.textContent = 'Unknown';
                                }
                            }
                        }

                    } else {
                        // API调用失败的情况，尝试从primary_clock字段获取信息
                        const primaryClock = systemClockData.primary_clock;
                        let clockSourceText = 'PTP同步时钟';
                        if (primaryClock === 'ptp1') {
                            clockSourceText = 'PTP时钟1';
                        } else if (primaryClock === 'ptp2') {
                            clockSourceText = 'PTP时钟2';
                        }
                        clockSourceElement.textContent = clockSourceText;
                        
                        const lockStatusElement = document.getElementById('lockStatus');
                        if (lockStatusElement) {
                            lockStatusElement.textContent = '状态未知';
                            lockStatusElement.className = 'status-value';
                        }
                        
                        const offsetElement = document.getElementById('offsetFromMaster');
                        if (offsetElement) offsetElement.textContent = 'Unknown';
                    }
                    
                    // 仍然需要获取GMID信息，从主时钟源获取
                    try {
                        // 获取主路时钟配置以确定使用哪个UDS路径
                        const primaryClockResponse = await fetch('/api/primary-clock');
                        const primaryClockData = await primaryClockResponse.json();
                        
                        let targetUdsPath = '/var/run/ptp4l'; // 默认PTP时钟1
                        if (primaryClockData.success && primaryClockData.primary_clock === 'ptp2') {
                            targetUdsPath = '/var/run/ptp4l1';
                        }
                        
                        // 获取对应PTP时钟的配置
                        let targetConfig = null;
                        if (targetUdsPath === '/var/run/ptp4l') {
                            targetConfig = await getPtp1Config();
                        } else {
                            targetConfig = await getPtp2Config();
                        }
                        
                        const domain = targetConfig ? parseInt(targetConfig.domainNumber) : 127;
                        
                        // 获取GM Identity
                        const timeStatusResponse = await fetch(`/api/ptp-timestatus?uds_path=${targetUdsPath}&domain=${domain}`);
                        const timeStatusData = await timeStatusResponse.json();
                        
                        if (timeStatusData.success) {
                            const gmIdentityElement = document.getElementById('gmIdentity');
                            if (gmIdentityElement) {
                                gmIdentityElement.textContent = timeStatusData.gmIdentity || 'Unknown';
                            }
                        }
                    } catch (error) {
                        console.error('获取GMID信息失败:', error);
                    }
                } else {
                    // BB或内部模式：显示本地内部时钟
                    clockSourceElement.textContent = '本地内部时钟';
                    
                    // 清空PTP相关状态
                    const gmIdentityElement = document.getElementById('gmIdentity');
                    const lockStatusElement = document.getElementById('lockStatus');
                    const offsetElement = document.getElementById('offsetFromMaster');
                    
                    if (gmIdentityElement) gmIdentityElement.textContent = '-';
                    if (lockStatusElement) {
                        lockStatusElement.textContent = '-';
                        lockStatusElement.className = 'status-value';
                    }
                    if (offsetElement) offsetElement.textContent = '-';
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
        // 获取PTP时钟1的当前配置
        const ptp1Config = await getPtp1Config();
        const domain = ptp1Config ? parseInt(ptp1Config.domainNumber) : 127; // 默认使用127
        
        // 获取时间状态（包含GM Identity）
        const timeStatusResponse = await fetch(`/api/ptp-timestatus?uds_path=/var/run/ptp4l&domain=${domain}`);
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
        const portResponse = await fetch(`/api/ptp-port-status?uds_path=/var/run/ptp4l&domain=${domain}`);
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
        const timeResponse = await fetch(`/api/ptp-currenttimedata?uds_path=/var/run/ptp4l&domain=${domain}`);
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
        // 获取PTP时钟2的当前配置
        const ptp2Config = await getPtp2Config();
        const domain = ptp2Config ? parseInt(ptp2Config.domainNumber) : 127; // 默认使用127
        
        // 获取时间状态（包含GM Identity）
        const timeStatusResponse = await fetch(`/api/ptp-timestatus?uds_path=/var/run/ptp4l1&domain=${domain}`);
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
        const portResponse = await fetch(`/api/ptp-port-status?uds_path=/var/run/ptp4l1&domain=${domain}`);
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
        const timeResponse = await fetch(`/api/ptp-currenttimedata?uds_path=/var/run/ptp4l1&domain=${domain}`);
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

// 控制PTP服务
async function controlPtpService(serviceName, action) {
    try {
        showLoading();
        
        const endpoint = action === 'start' ? '/api/systemd/start-service' : '/api/systemd/stop-service';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ service_name: serviceName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const actionText = action === 'start' ? '启动' : '停止';
            showNotification(`${serviceName} ${actionText}成功`, 'success');
            
            // 延迟更新状态，给服务一些启动/停止的时间
            setTimeout(() => {
                if (serviceName === 'ptp4l.service') {
                    updatePtpStatus();
                } else if (serviceName === 'ptp4l1.service') {
                    updatePtpStatus2();
                }
            }, 2000);
        } else {
            const actionText = action === 'start' ? '启动' : '停止';
            showNotification(`${serviceName} ${actionText}失败: ${data.error}`, 'error');
        }
    } catch (error) {
        const actionText = action === 'start' ? '启动' : '停止';
        showNotification(`${serviceName} ${actionText}失败: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
} 