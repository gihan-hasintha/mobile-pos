import { defineConfig } from 'vite';

export default defineConfig({
  root: './src',
  build: {
    outDir: '../dist',
    minify: false,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: './src/index.html',
        expenses: './src/expenses.html',
        bills: './src/bills.html',
        returns_history: './src/returns_history.html',
        returns: './src/returns.html',
        customers: './src/customers.html',
        salessummary: './src/sales_summary.html',
        access_manage: './src/access_manage.html',
        stock_manage: './src/stock_manage.html',
        stock_history: './src/stock_history.html',
        stock_history1: './src/stock_history1.html',
        stock_manage1: './src/stock_manage1.html'
      },
    },
  },
});