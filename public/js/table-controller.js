// public/js/table-controller.js

class TableController {
    constructor(config) {
        this.tbodyId = config.tbodyId;
        this.emptyMessage = config.emptyMessage || "No records found.";
        this.sortState = config.initialSort || { column: 'name', order: 'asc' };
        
        // Callbacks
        this.renderRow = config.renderRow; 
        this.sortFunction = config.sortFunction; 
        this.onSortChange = config.onSortChange; 
        this.onRenderComplete = config.onRenderComplete;

        // Pagination State
        this.paginationConfig = config.pagination || null;
        this.page = 1;
        this.limit = config.initialLimit === 'all' ? 99999 : (parseInt(config.initialLimit) || 25);
        this.total = 0;

        this.data = [];

        // Standardized SVG Icons
        this.ICON_ASC = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
        this.ICON_DESC = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
        this.ICON_NONE = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3"><path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/></svg>';

        if (this.paginationConfig) {
            this.setupPaginationListeners();
        }
    }

    setData(newData, totalCount = null) {
        this.data = newData;
        if (totalCount !== null) {
            this.total = totalCount;
        }
        this.applySort();
    }

    handleSort(column) {
        if (this.sortState.column === column) {
            this.sortState.order = this.sortState.order === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.column = column;
            this.sortState.order = 'asc';
        }
        
        if (this.onSortChange) this.onSortChange(this.sortState);
        this.applySort();
    }

    applySort() {
        if (this.sortFunction) {
            // Note: Since live-forms uses server-side pagination, 
            // this only sorts the currently visible page of records.
            this.data.sort((a, b) => this.sortFunction(a, b, this.sortState));
        }
        this.updateSortIcons();
        this.render();
    }

    updateSortIcons() {
        document.querySelectorAll('.sort-icon').forEach(icon => {
            icon.innerHTML = this.ICON_NONE;
            icon.classList.remove('active');
        });
        
        const activeIcon = document.getElementById(`icon-${this.sortState.column}`);
        if (activeIcon) {
            activeIcon.innerHTML = this.sortState.order === 'asc' ? this.ICON_ASC : this.ICON_DESC;
            activeIcon.classList.add('active');
        }
    }

    // --- Pagination Logic ---
    setupPaginationListeners() {
        const { prevId, nextId } = this.paginationConfig;
        const btnPrev = document.getElementById(prevId);
        const btnNext = document.getElementById(nextId);
        
        if (btnPrev) btnPrev.addEventListener('click', () => this.changePage(-1));
        if (btnNext) btnNext.addEventListener('click', () => this.changePage(1));
    }

    changePage(delta) {
        const totalPages = Math.ceil(this.total / this.limit);
        const newPage = this.page + delta;
        
        if (newPage >= 1 && newPage <= totalPages) {
            this.page = newPage;
            if (this.paginationConfig.onPageChange) {
                this.paginationConfig.onPageChange(this.page, this.limit);
            }
        }
    }

    setLimit(newLimit) {
        this.limit = newLimit === 'all' ? 99999 : parseInt(newLimit);
        this.page = 1; // Reset to first page
        if (this.paginationConfig.onPageChange) {
            this.paginationConfig.onPageChange(this.page, this.limit);
        }
    }

    updatePaginationUI() {
        if (!this.paginationConfig) return;
        const { containerId, infoId, prevId, nextId } = this.paginationConfig;
        
        const container = document.getElementById(containerId);
        const info = document.getElementById(infoId);
        const btnPrev = document.getElementById(prevId);
        const btnNext = document.getElementById(nextId);
        
        if (!container || !info || !btnPrev || !btnNext) return;

        const totalPages = Math.ceil(this.total / this.limit);
        const start = this.total === 0 ? 0 : ((this.page - 1) * this.limit) + 1;
        const end = Math.min(this.page * this.limit, this.total);

        container.style.display = this.total > 0 ? 'flex' : 'none';
        info.textContent = `Showing ${start}-${end} of ${this.total}`;
        
        btnPrev.disabled = this.page <= 1;
        btnNext.disabled = this.page >= totalPages;
    }

    render() {
        const tbody = document.getElementById(this.tbodyId);
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (this.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="100%" class="text-center" style="color:var(--text-muted); padding: 20px;">${this.emptyMessage}</td></tr>`;
        } else {
            this.data.forEach((item, index) => {
                const tr = this.renderRow(item, index);
                tbody.appendChild(tr);
            });
        }

        if (this.paginationConfig) this.updatePaginationUI();
        if (this.onRenderComplete) this.onRenderComplete();
    }
}