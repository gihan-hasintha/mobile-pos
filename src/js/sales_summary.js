import { rtdb } from "./firebase_config.js";
import { ref, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { db } from "./firebase_config.js";
import { collection, getDocs, query as fsQuery, orderBy, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Firebase references
const billsRef = ref(rtdb, 'bills');
const returnsRef = ref(rtdb, 'returns');
const expensesCollection = collection(db, "expenses");

// Global variables
let allBillsData = [];
let allExpensesData = [];
let allReturnsData = [];
let currentDateRange = 'today';
let salesChart = null;
let currentChartPeriod = 'today';

// Initialize the page
window.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadSalesSummary();
});

function setupEventListeners() {
    const dateRangeSelect = document.getElementById('dateRange');
    if (dateRangeSelect) {
        dateRangeSelect.addEventListener('change', (e) => {
            currentDateRange = e.target.value;
            loadSalesSummary();
        });
    }
}

async function loadSalesSummary() {
    showLoadingState();
    
    try {
        // Load all data in parallel
        await Promise.all([
            loadBillsData(),
            loadExpensesData(),
            loadReturnsData()
        ]);
        
        // Calculate and display metrics
        calculateAndDisplayMetrics();
        
        // Initialize and update chart
        initializeChart();
        updateChart();
        
    } catch (error) {
        console.error('Error loading sales summary:', error);
        showErrorState('Failed to load sales data. Please try again.');
    }
}

async function loadBillsData() {
    try {
        const snapshot = await get(billsRef);
        if (!snapshot.exists()) {
            allBillsData = [];
            return;
        }
        
        const bills = [];
        snapshot.forEach((childSnapshot) => {
            const data = childSnapshot.val();
            const createdAtMs = typeof data.createdAtTimestamp === 'number'
                ? data.createdAtTimestamp
                : (typeof data.createdAt === 'string' ? parseCreatedAtToMs(data.createdAt) : 0);
            
            bills.push({
                id: childSnapshot.key,
                createdAtMs,
                createdAtFormatted: data.createdAt,
                ...data
            });
        });
        
        allBillsData = bills.sort((a, b) => b.createdAtMs - a.createdAtMs);
    } catch (error) {
        console.error('Error loading bills:', error);
        allBillsData = [];
    }
}

async function loadExpensesData() {
    try {
        const q = fsQuery(expensesCollection, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        
        const expenses = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            expenses.push({
                id: doc.id,
                createdAtMs: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : Date.now(),
                ...data
            });
        });
        
        allExpensesData = expenses;
    } catch (error) {
        console.error('Error loading expenses:', error);
        allExpensesData = [];
    }
}

async function loadReturnsData() {
    try {
        const snapshot = await get(returnsRef);
        if (!snapshot.exists()) {
            allReturnsData = [];
            return;
        }
        
        const returns = [];
        snapshot.forEach((childSnapshot) => {
            const data = childSnapshot.val();
            const createdAtMs = typeof data.createdAtTimestamp === 'number'
                ? data.createdAtTimestamp
                : (typeof data.createdAt === 'string' ? parseCreatedAtToMs(data.createdAt) : 0);
            
            returns.push({
                id: childSnapshot.key,
                createdAtMs,
                createdAtFormatted: data.createdAt,
                ...data
            });
        });
        
        allReturnsData = returns.sort((a, b) => b.createdAtMs - a.createdAtMs);
    } catch (error) {
        console.error('Error loading returns:', error);
        allReturnsData = [];
    }
}

function parseCreatedAtToMs(createdAtStr) {
    if (typeof createdAtStr !== 'string') return 0;
    const normalized = createdAtStr.replace(' at ', ' ');
    const t = Date.parse(normalized);
    return Number.isFinite(t) ? t : 0;
}

function calculateAndDisplayMetrics() {
    const filteredData = filterDataByDateRange();
    
    if (filteredData.bills.length === 0 && filteredData.expenses.length === 0 && filteredData.returns.length === 0) {
        showNoDataState();
        return;
    }
    
    const metrics = calculateMetrics(filteredData);
    displayMetrics(metrics);
    displayDetailedBreakdown(filteredData, metrics);
    
    showDataState();
}

function filterDataByDateRange() {
    const now = new Date();
    const nowMs = now.getTime();
    
    let startTime, endTime;
    
    switch (currentDateRange) {
        case 'today':
            startTime = startOfDay(now).getTime();
            endTime = nowMs;
            break;
        case 'yesterday':
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            startTime = startOfDay(yesterday).getTime();
            endTime = startOfDay(now).getTime();
            break;
        case 'thisWeek':
            const weekStart = getWeekStart(now);
            startTime = weekStart.getTime();
            endTime = nowMs;
            break;
        case 'thisMonth':
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            startTime = monthStart.getTime();
            endTime = nowMs;
            break;
        case 'lastMonth':
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
            startTime = lastMonthStart.getTime();
            endTime = lastMonthEnd.getTime();
            break;
        case 'all':
        default:
            startTime = 0;
            endTime = nowMs;
    }
    
    const filteredBills = allBillsData.filter(bill => {
        const billTime = Number(bill.createdAtMs || 0);
        return billTime >= startTime && billTime <= endTime;
    });
    
    const filteredExpenses = allExpensesData.filter(expense => {
        const expenseTime = Number(expense.createdAtMs || 0);
        return expenseTime >= startTime && expenseTime <= endTime;
    });
    
    const filteredReturns = allReturnsData.filter(returnItem => {
        const returnTime = Number(returnItem.createdAtMs || 0);
        return returnTime >= startTime && returnTime <= endTime;
    });
    
    return {
        bills: filteredBills,
        expenses: filteredExpenses,
        returns: filteredReturns
    };
}

function startOfDay(date) {
    const dt = new Date(date);
    dt.setHours(0, 0, 0, 0);
    return dt;
}

function getWeekStart(date) {
    const dt = new Date(date);
    const day = dt.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - diff);
    return startOfDay(monday);
}

function calculateMetrics(data) {
    // Calculate sales metrics
    let grossSales = 0;
    let totalDiscounts = 0;
    let totalItemsSold = 0;
    let totalBills = data.bills.length;
    
    data.bills.forEach(bill => {
        const billTotal = Number(bill.grandTotal || 0);
        const billDiscount = Number(bill.discount || 0);
        const itemCount = Number(bill.itemCount || 0);
        
        grossSales += billTotal + billDiscount; // Add discount back to get gross sales
        totalDiscounts += billDiscount;
        totalItemsSold += itemCount;
    });
    
    const netSales = grossSales - totalDiscounts;
    
    // Calculate expenses
    const totalExpenses = data.expenses.reduce((sum, expense) => {
        return sum + Number(expense.amount || 0);
    }, 0);
    
    // Calculate returns
    const totalReturns = data.returns.reduce((sum, returnItem) => {
        return sum + Number(returnItem.refundedAmount || 0);
    }, 0);
    
    // Calculate cost of goods sold (simplified - you may need to adjust based on your data structure)
    const costOfGoodsSold = netSales * 0.6; // Assuming 60% cost ratio - adjust as needed
    
    // Calculate profits
    const grossProfit = netSales - costOfGoodsSold;
    const netProfit = grossProfit - totalExpenses - totalReturns;
    
    // Calculate average bill value
    const averageBillValue = totalBills > 0 ? netSales / totalBills : 0;
    
    return {
        grossSales,
        totalDiscounts,
        netSales,
        totalExpenses,
        totalReturns,
        costOfGoodsSold,
        grossProfit,
        netProfit,
        totalBills,
        totalItemsSold,
        averageBillValue
    };
}

function displayMetrics(metrics) {
    // Format currency values
    const formatCurrency = (value) => `LKR ${Number(value).toFixed(2)}`;
    
    // Update main metric cards
    document.getElementById('grossSalesValue').textContent = formatCurrency(metrics.grossSales);
    document.getElementById('discountsValue').textContent = formatCurrency(metrics.totalDiscounts);
    document.getElementById('netSalesValue').textContent = formatCurrency(metrics.netSales);
    document.getElementById('grossProfitValue').textContent = formatCurrency(metrics.grossProfit);
    document.getElementById('expensesValue').textContent = formatCurrency(metrics.totalExpenses);
    document.getElementById('netProfitValue').textContent = formatCurrency(metrics.netProfit);
    document.getElementById('returnsValue').textContent = formatCurrency(metrics.totalReturns);
    
    // Add change indicators (simplified - you can enhance this with historical data)
    updateChangeIndicator('grossSalesChange', metrics.grossSales > 0);
    updateChangeIndicator('discountsChange', metrics.totalDiscounts > 0);
    updateChangeIndicator('netSalesChange', metrics.netSales > 0);
    updateChangeIndicator('grossProfitChange', metrics.grossProfit > 0);
    updateChangeIndicator('expensesChange', metrics.totalExpenses > 0);
    updateChangeIndicator('netProfitChange', metrics.netProfit > 0);
    updateChangeIndicator('returnsChange', metrics.totalReturns > 0);
}

function updateChangeIndicator(elementId, isPositive) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = isPositive ? '↗ Positive' : '→ Neutral';
        element.className = `metric-change ${isPositive ? 'positive' : 'negative'}`;
    }
}

function displayDetailedBreakdown(data, metrics) {
    const formatCurrency = (value) => `LKR ${Number(value).toFixed(2)}`;
    
    // Update breakdown values
    document.getElementById('totalBills').textContent = metrics.totalBills;
    document.getElementById('totalItemsSold').textContent = metrics.totalItemsSold;
    document.getElementById('averageBillValue').textContent = formatCurrency(metrics.averageBillValue);
    document.getElementById('breakdownGrossSales').textContent = formatCurrency(metrics.grossSales);
    document.getElementById('breakdownDiscounts').textContent = formatCurrency(metrics.totalDiscounts);
    document.getElementById('breakdownNetSales').textContent = formatCurrency(metrics.netSales);
    document.getElementById('costOfGoodsSold').textContent = formatCurrency(metrics.costOfGoodsSold);
    document.getElementById('breakdownGrossProfit').textContent = formatCurrency(metrics.grossProfit);
    document.getElementById('breakdownExpenses').textContent = formatCurrency(metrics.totalExpenses);
    document.getElementById('breakdownReturns').textContent = formatCurrency(metrics.totalReturns);
    document.getElementById('breakdownNetProfit').textContent = formatCurrency(metrics.netProfit);
}

function showLoadingState() {
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('noDataState').style.display = 'none';
    document.getElementById('metricsContainer').style.display = 'none';
    document.getElementById('detailedBreakdown').style.display = 'none';
}

function showErrorState(message) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('noDataState').style.display = 'none';
    document.getElementById('metricsContainer').style.display = 'none';
    document.getElementById('detailedBreakdown').style.display = 'none';
}

function showNoDataState() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('noDataState').style.display = 'block';
    document.getElementById('metricsContainer').style.display = 'none';
    document.getElementById('detailedBreakdown').style.display = 'none';
}

function showDataState() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('noDataState').style.display = 'none';
    document.getElementById('metricsContainer').style.display = 'grid';
    document.getElementById('detailedBreakdown').style.display = 'block';
}

// Chart functionality
function initializeChart() {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;

    if (salesChart) {
        salesChart.destroy();
    }

    salesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Sales',
                data: [],
                backgroundColor: 'rgba(0, 47, 255, 0.8)',
                borderColor: 'rgba(0, 47, 255, 1)',
                borderWidth: 1,
                borderRadius: 4,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: 'white',
                    bodyColor: 'white',
                    borderColor: 'rgba(0, 47, 255, 1)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return 'Sales: LKR ' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        callback: function(value) {
                            return 'LKR ' + value.toFixed(0);
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart'
            }
        }
    });
}

function updateChart() {
    if (!salesChart) return;

    const chartData = processChartData();
    
    salesChart.data.labels = chartData.labels;
    salesChart.data.datasets[0].data = chartData.data;
    salesChart.update('active');

    // Update chart statistics
    updateChartStats(chartData);
}

function processChartData() {
    const now = new Date();
    let labels = [];
    let data = [];
    let startDate, endDate;

    switch (currentChartPeriod) {
        case 'today':
            // Hourly data for today
            startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(now);
            
            for (let i = 0; i < 24; i++) {
                const hour = new Date(startDate);
                hour.setHours(i);
                labels.push(hour.getHours() + ':00');
                data.push(getSalesForHour(hour));
            }
            break;

        case 'week':
            // Daily data for this week
            const weekStart = getWeekStart(now);
            for (let i = 0; i < 7; i++) {
                const day = new Date(weekStart);
                day.setDate(weekStart.getDate() + i);
                labels.push(day.toLocaleDateString('en-US', { weekday: 'short' }));
                data.push(getSalesForDay(day));
            }
            break;

        case 'month':
            // Weekly data for this month
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            
            let currentWeek = new Date(monthStart);
            while (currentWeek <= monthEnd) {
                const weekEnd = new Date(currentWeek);
                weekEnd.setDate(currentWeek.getDate() + 6);
                if (weekEnd > monthEnd) weekEnd.setTime(monthEnd.getTime());
                
                labels.push(`Week ${Math.ceil((currentWeek.getDate() + 6) / 7)}`);
                data.push(getSalesForDateRange(currentWeek, weekEnd));
                
                currentWeek.setDate(currentWeek.getDate() + 7);
            }
            break;
    }

    return { labels, data };
}

function getSalesForHour(hour) {
    const hourStart = new Date(hour);
    const hourEnd = new Date(hour);
    hourEnd.setHours(hour.getHours() + 1);

    return allBillsData
        .filter(bill => {
            const billTime = new Date(bill.createdAtMs);
            return billTime >= hourStart && billTime < hourEnd;
        })
        .reduce((sum, bill) => sum + Number(bill.grandTotal || 0), 0);
}

function getSalesForDay(day) {
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    return allBillsData
        .filter(bill => {
            const billTime = new Date(bill.createdAtMs);
            return billTime >= dayStart && billTime < dayEnd;
        })
        .reduce((sum, bill) => sum + Number(bill.grandTotal || 0), 0);
}

function getSalesForDateRange(startDate, endDate) {
    return allBillsData
        .filter(bill => {
            const billTime = new Date(bill.createdAtMs);
            return billTime >= startDate && billTime <= endDate;
        })
        .reduce((sum, bill) => sum + Number(bill.grandTotal || 0), 0);
}

function updateChartStats(chartData) {
    const totalSales = chartData.data.reduce((sum, value) => sum + value, 0);
    const averageDaily = chartData.data.length > 0 ? totalSales / chartData.data.length : 0;
    const bestDay = Math.max(...chartData.data, 0);
    
    // Calculate growth (simplified - comparing with previous period)
    const growth = calculateGrowth();
    
    document.getElementById('chartTotalSales').textContent = `LKR ${totalSales.toFixed(2)}`;
    document.getElementById('chartAverageDaily').textContent = `LKR ${averageDaily.toFixed(2)}`;
    document.getElementById('chartBestDay').textContent = `LKR ${bestDay.toFixed(2)}`;
    
    const growthElement = document.getElementById('chartGrowth');
    growthElement.textContent = `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`;
    growthElement.className = `stat-value ${growth >= 0 ? 'positive' : 'negative'}`;
}

function calculateGrowth() {
    // Simplified growth calculation - you can enhance this with historical data
    const currentPeriodSales = getCurrentPeriodSales();
    const previousPeriodSales = getPreviousPeriodSales();
    
    if (previousPeriodSales === 0) return 0;
    return ((currentPeriodSales - previousPeriodSales) / previousPeriodSales) * 100;
}

function getCurrentPeriodSales() {
    const now = new Date();
    let startDate, endDate;

    switch (currentChartPeriod) {
        case 'today':
            startDate = startOfDay(now);
            endDate = now;
            break;
        case 'week':
            startDate = getWeekStart(now);
            endDate = now;
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = now;
            break;
    }

    return getSalesForDateRange(startDate, endDate);
}

function getPreviousPeriodSales() {
    const now = new Date();
    let startDate, endDate;

    switch (currentChartPeriod) {
        case 'today':
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            startDate = startOfDay(yesterday);
            endDate = new Date(yesterday);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'week':
            const lastWeekStart = getWeekStart(now);
            lastWeekStart.setDate(lastWeekStart.getDate() - 7);
            const lastWeekEnd = new Date(lastWeekStart);
            lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
            startDate = lastWeekStart;
            endDate = lastWeekEnd;
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;
    }

    return getSalesForDateRange(startDate, endDate);
}

function switchChartPeriod(period) {
    currentChartPeriod = period;
    
    // Update button states
    document.querySelectorAll('.chart-period-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-period="${period}"]`).classList.add('active');
    
    // Update chart
    updateChart();
}

// Export functions for global access
window.loadSalesSummary = loadSalesSummary;
window.switchChartPeriod = switchChartPeriod;
