let walletData = JSON.parse(localStorage.getItem('miu_wallet_data')) || {
    bgImage: "", 
    netAsset: 0.00,
    transactions: []
};

// 辅助：保存数据到本地
function saveWalletData() {
    localStorage.setItem('miu_wallet_data', JSON.stringify(walletData));
}

// 2. 打开钱包
function openWallet() {
    const overlay = document.getElementById('wallet-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('active'), 10);
        loadAndRenderWallet();
    }
}

// 3. 关闭钱包
function closeWallet() {
    const overlay = document.getElementById('wallet-overlay');
    const menu = document.getElementById('walletBgMenu');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.style.display = 'none', 300);
    }
    if (menu) menu.style.display = 'none';
}

// 4. 加载并渲染
function loadAndRenderWallet() {
    // --- 1. 设置背景 ---
    const bgLayer = document.getElementById('wallet-bg-layer');
    if (walletData.bgImage) {
        bgLayer.style.backgroundImage = `url(${walletData.bgImage})`;
    } else {
        bgLayer.style.backgroundImage = ''; 
        bgLayer.style.backgroundColor = '#FFF2F4'; 
    }

    // --- 2. 计算金额（流水统计） ---
    let totalExpense = 0;
    let impliedIncome = 0; // 用于统计总收入
    
    walletData.transactions.forEach(t => {
        if (t.type === 'expense') totalExpense += Math.abs(t.amount);
        if (t.type === 'income') impliedIncome += t.amount;
    });

    // --- 3. 计算净资产与负债 (核心修改部分) ---
    let currentNetAsset = walletData.netAsset;
    let currentLiability = 0; // 默认为 0

    // ★ 逻辑修正：只有当净资产变成负数时，才算作负债
    if (currentNetAsset < 0) {
        currentLiability = Math.abs(currentNetAsset); // 取绝对值，比如 -50 显示为 50
    }

    // --- 4. 更新界面数字 ---
    
    // 更新大标题：净资产
    document.getElementById('wallet-net-asset').innerText = formatCurrency(currentNetAsset);
    
    const elAssets = document.getElementById('wallet-total-assets');
    const elLiabilities = document.getElementById('wallet-total-liabilities');
    
    // 更新总资产 (这里保持显示净资产，透支时显示负数)
    if (elAssets) elAssets.innerText = formatCurrency(currentNetAsset); 
    
    // ★ 更新总负债：显示刚才计算出来的 currentLiability
    if (elLiabilities) elLiabilities.innerText = formatCurrency(currentLiability); 
    
    // 更新总收入/总支出 (流水)
    document.getElementById('wallet-total-income').innerText = formatCurrency(impliedIncome);
    document.getElementById('wallet-total-expense').innerText = formatCurrency(totalExpense);

    // --- 5. 渲染列表 ---
    const listContainer = document.getElementById('wallet-transaction-list');
    const emptyState = document.getElementById('wallet-empty-state');
    listContainer.innerHTML = ''; 

    if (walletData.transactions.length === 0) {
        if(emptyState) emptyState.style.display = 'block';
    } else {
        if(emptyState) emptyState.style.display = 'none';
        
        const grouped = {};
        walletData.transactions.forEach(t => {
            if (!grouped[t.date]) {
                grouped[t.date] = { dayStr: t.dayStr, items: [], dayIncome: 0, dayExpense: 0 };
            }
            grouped[t.date].items.push(t);
            if (t.type === 'income') grouped[t.date].dayIncome += t.amount;
            else grouped[t.date].dayExpense += Math.abs(t.amount);
        });

        const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

        sortedDates.forEach(date => {
            const group = grouped[date];
            const dateParts = date.split('-'); 
            const displayDate = `${dateParts[1]}/${dateParts[2]} ${group.dayStr}`;
            
            const headerHtml = `
                <div class="w-date-header">
                    <span>${displayDate}</span>
                    <span>支出: ¥${group.dayExpense.toFixed(2)}  收入: ¥${group.dayIncome.toFixed(2)}</span>
                </div>`;
            
            let itemsHtml = '';
            group.items.forEach(item => {
                const isExpense = (item.type === 'expense');
                const arrowClass = isExpense ? 'fa-arrow-down' : 'fa-arrow-up';
                const boxClass = isExpense ? 'expense' : 'income';
                const sign = isExpense ? '-' : '+';
                
                const displayName = item.category || '一般消费';

                itemsHtml += `
                    <div class="w-trans-item">
                        <div class="w-arrow-box ${boxClass}">
                            <i class="fas ${arrowClass}"></i>
                        </div>
                        <div class="w-trans-info">
                            <div class="w-trans-name">${displayName}</div>
                            <div class="w-trans-time">${item.time}</div>
                        </div>
                        <div class="w-trans-amount">
                            ${sign}¥${Math.abs(item.amount).toFixed(2)}
                        </div>
                    </div>
                `;
            });

            listContainer.insertAdjacentHTML('beforeend', `${headerHtml}<div class="w-trans-card-group">${itemsHtml}</div>`);
        });
    }
}

// 5. 修改净资产
function editWalletAsset() {
    const currentVal = walletData.netAsset;
    const input = prompt("请输入当前净资产总额 (¥):", currentVal);
    if (input !== null) {
        const num = parseFloat(input);
        if (!isNaN(num)) {
            walletData.netAsset = num;
            saveWalletData(); // ★ 保存
            loadAndRenderWallet();
        }
    }
}

// 6. 背景点击与菜单
function handleWalletBgClick(event) {
    const menu = document.getElementById('walletBgMenu');
    if (menu.style.display === 'flex' && !event.target.closest('#walletBgMenu')) {
        menu.style.display = 'none';
        return;
    }
    if (event.target.closest('.w-card') || event.target.closest('.w-date-header') || event.target.closest('.w-trans-card-group')) {
        menu.style.display = 'none'; 
        return;
    }
    const x = event.clientX;
    const y = event.clientY;
    const menuWidth = 130; 
    const finalX = (window.innerWidth - x < menuWidth) ? (x - menuWidth) : x;
    menu.style.left = finalX + 'px';
    menu.style.top = y + 'px';
    menu.style.display = 'flex'; 
}

// 7. 更换背景
function changeWalletBg(type) {
    const menu = document.getElementById('walletBgMenu');
    menu.style.display = 'none'; 
    
    if (type === 'link') {
        const url = prompt("请输入图片链接 (URL):");
        if (url) {
            walletData.bgImage = url;
            saveWalletData(); // ★ 保存
            loadAndRenderWallet();
        }
    } else if (type === 'local') {
        document.getElementById('wallet-bg-input').click();
    } else if (type === 'clear') {
        walletData.bgImage = "";
        saveWalletData(); // ★ 保存
        loadAndRenderWallet();
    }
}

function handleWalletBgUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            walletData.bgImage = e.target.result;
            saveWalletData(); // ★ 保存
            loadAndRenderWallet();
        };
        reader.readAsDataURL(input.files[0]);
    }
    input.value = ''; 
}

// 8. ★★★ 核心记账接口 ★★★
// category 参数现在将作为显示名称（例如：显示“转账-CharName”）
function handleTransaction(type, amount, category) {
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const days = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    
    // 如果没有传入 category，给个默认值
    if (!category) category = (type === 'income') ? '收入' : '消费';

    walletData.transactions.unshift({
        id: Date.now(),
        type: type, 
        category: category, // 这里存的就是“谁转的”
        amount: parseFloat(amount),
        time: timeStr,
        date: dateStr,
        dayStr: days[now.getDay()]
    });
    
    if (type === 'expense') walletData.netAsset -= parseFloat(amount);
    else walletData.netAsset += parseFloat(amount);
    
    saveWalletData(); // ★ 保存数据到本地

    // 如果钱包界面正开着，刷新一下
    if (document.getElementById('wallet-overlay').classList.contains('active')) {
        loadAndRenderWallet();
    }
}

function formatCurrency(num) {
    return '¥' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}