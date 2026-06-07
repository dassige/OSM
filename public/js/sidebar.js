// public/js/sidebar.js

document.addEventListener("DOMContentLoaded", () => {
    // SVG Icons
    const iconMenu  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
    const iconClose = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    const iconUser  = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

    // Sidebar HTML Structure with memory IDs and role attributes
    const sidebarHTML = `
          <button id="osm-open-btn" class="osm-icon-btn" title="Open Menu">${iconMenu}</button>
          <div id="osm-sidebar-container">
              <div class="sidebar-header">
                  <div id="osm-header-actions" class="sidebar-header-actions">
                      <button id="osm-close-btn" class="osm-icon-btn" title="Close menu">${iconClose}</button>
                      <button id="osm-profile-btn" class="osm-icon-btn" title="User profile and settings">${iconUser}<span id="osm-profile-name">User</span></button>
                  </div>
              </div>
              <div id="osm-profile-dropdown" class="osm-profile-dropdown">
                  <div class="osm-profile-name-row">
                      ${iconUser}
                      <span id="userNameDisplay">User</span>
                  </div>
                  <a href="profile.html">User Settings</a>
                  <div class="osm-dark-mode-row" onclick="document.getElementById('darkModeToggle').click()">
                      <span>Dark Mode</span>
                      <label class="switch" style="margin:0; pointer-events:none;">
                          <input type="checkbox" id="darkModeToggle"
                              onchange="toggleDarkMode(this.checked); event.stopPropagation();"
                              style="pointer-events:auto;">
                          <span class="slider"></span>
                      </label>
                  </div>
                  <a href="#" class="osm-logout" id="osm-logout-link">Logout</a>
              </div>
              <nav id="osm-sidebar-nav">
                  <ul class="osm-menu">
                      <li><a href="/">Home</a></li>
                      
                      <li class="has-children" id="groupOperations" data-role="simple">
                          <div class="menu-label" onclick="toggleSubmenu(event, 'submenuOperations')">Operations</div>
                          <ul id="submenuOperations" class="submenu">
                              <li class="has-children" id="groupMaintenance" data-role="admin">
                                  <div class="menu-label" onclick="toggleSubmenu(event, 'submenuMaintenance')">Maintenance</div>
                                  <ul id="submenuMaintenance" class="submenu">
                                      <li><a href="members.html" id="navManageMembers">Manage Members</a></li>
                                      <li><a href="skills.html" id="navManageSkills">Manage Skills</a></li>
                                      <li><a href="forms-manage.html" id="navManageForms">Manage Forms</a></li>
                                      <li><a href="surveys-manage.html" id="navManageSurveys">Manage Surveys</a></li>
                                  </ul>
                              </li>
                              <li><a href="training-planner.html" id="navTrainingPlanner">Renewal Planner</a></li>
                              <li><a href="live-forms.html" id="navLiveForms">Live Forms</a></li>
                              <li><a href="live-surveys.html" id="navLiveSurveys">Surveys</a></li>
                          </ul>
                      </li>
  
                      <li class="has-children" id="groupComms" data-role="admin">
                          <div class="menu-label" onclick="toggleSubmenu(event, 'submenuComms')">Communication</div>
                          <ul id="submenuComms" class="submenu">
                              <li><a href="templates.html" id="navEmailTemplates">Templates</a></li>
                              <li><a href="third-parties.html" id="navThirdParties">Third Party (WhatsApp)</a></li>
                          </ul>
                      </li>
  
                      <li class="has-children" id="groupReports" data-role="simple">
                          <div class="menu-label" onclick="toggleSubmenu(event, 'submenuReports')">Reports</div>
                          <ul id="submenuReports" class="submenu">
                              <li><a href="reports.html" id="navReports">Reports</a></li>
                              <li><a href="statistics.html" id="navStats">Statistics</a></li>
                          </ul>
                      </li>
  
                      <li class="has-children" id="groupKnowledgeBase" data-role="admin">
                          <div class="menu-label" onclick="toggleSubmenu(event, 'submenuKnowledgeBase')">Knowledge Base</div>
                          <ul id="submenuKnowledgeBase" class="submenu">
                              <li><a href="knowledgebase.html" id="navKnowledgeBase">Manage Documents</a></li>
                          </ul>
                      </li>

                      <li class="has-children" id="groupSystem" data-role="admin">
                          <div class="menu-label" onclick="toggleSubmenu(event, 'submenuSystem')">System Admin</div>
                          <ul id="submenuSystem" class="submenu">
                              <li><a href="users.html" id="navManageUsers">Manage Users</a></li>
                              <li><a href="event-log.html" id="navEventLog">Event Log</a></li>
                              <li data-role="admin"><a href="api-management.html" id="navApiManagement">API Management</a></li>
                              <li data-role="superadmin"><a href="system-tools.html" id="navSystemTools">System Tools</a></li>
                              <li data-role="superadmin"><a href="backup-restore.html" id="navBackupRestore">Backup &amp; Restore</a></li>
                          </ul>
                      </li>
                      <li><a href="profile.html">User Preferences</a></li>
                      <li><a href="#" onclick="showAboutModal()">About</a></li>
                  </ul>
              </nav>
          </div>
      `;
  
    document.body.insertAdjacentHTML("afterbegin", sidebarHTML);

    // Inject backdrop element (used only on mobile)
    const backdrop = document.createElement("div");
    backdrop.id = "osm-backdrop";
    document.body.appendChild(backdrop);

    const sidebar        = document.getElementById("osm-sidebar-container");
    const openBtn        = document.getElementById("osm-open-btn");
    const closeBtn       = document.getElementById("osm-close-btn");
    const profileBtn     = document.getElementById("osm-profile-btn");
    const profileDropdown = document.getElementById("osm-profile-dropdown");

    const isMobile = () => window.innerWidth <= 768;

    // Populate sidebar-header app title (mobile only — hidden on desktop via CSS)
    const titleEl = document.createElement("span");
    titleEl.className = "sidebar-title";
    titleEl.textContent = "OpReady";
    fetch("/ui-config").then(r => r.json())
        .then(c => { if (c.loginTitle) titleEl.textContent = c.loginTitle; })
        .catch(() => {});
    // Insert title before the header-actions group so layout is [title] [close|profile]
    document.querySelector(".sidebar-header").insertBefore(titleEl, document.getElementById("osm-header-actions"));

    // ── Profile dropdown ──────────────────────────────────────────────────────
    profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle("show");
    });

    document.getElementById("osm-logout-link").addEventListener("click", (e) => {
        e.preventDefault();
        window.location.href = "/logout";
    });

    // Close profile dropdown on outside click
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#osm-profile-btn") && !e.target.closest("#osm-profile-dropdown")) {
            profileDropdown.classList.remove("show");
        }
    });

    // ── Backdrop helpers ──────────────────────────────────────────────────────
    const showBackdrop = () => {
        backdrop.classList.remove("hiding");
        backdrop.classList.add("visible");
    };
    const hideBackdrop = () => {
        backdrop.classList.add("hiding");
        setTimeout(() => {
            backdrop.classList.remove("visible", "hiding");
        }, 250);
    };

    // ── Sidebar Toggle ────────────────────────────────────────────────────────
    const toggleSidebar = (isCollapsed) => {
        if (isCollapsed) {
            sidebar.classList.add("collapsed");
            profileDropdown.classList.remove("show");
            hideBackdrop();
            document.body.style.overflow = "";
            // Desktop only: restore push-layout margin
            if (!isMobile()) {
                document.body.classList.add("osm-no-margin");
                openBtn.style.display = "flex";
            }
        } else {
            sidebar.classList.remove("collapsed");
            if (isMobile()) {
                // Overlay mode: show backdrop, lock body scroll
                showBackdrop();
                document.body.style.overflow = "hidden";
            } else {
                // Desktop push mode
                document.body.classList.remove("osm-no-margin");
                openBtn.style.display = "none";
            }
        }
        // Only persist collapsed state for desktop (mobile always starts closed)
        if (!isMobile()) {
            localStorage.setItem("sidebar-collapsed", isCollapsed);
        }
    };

    openBtn.addEventListener("click", () => toggleSidebar(false));
    closeBtn.addEventListener("click", () => toggleSidebar(true));
    backdrop.addEventListener("click", () => toggleSidebar(true));

    // Close sidebar when navigating on mobile (link tap)
    document.getElementById("osm-sidebar-nav").addEventListener("click", e => {
        if (isMobile() && e.target.tagName === "A" && e.target.href) {
            toggleSidebar(true);
        }
    });

    // On resize: clean up overlay state if switching desktop↔mobile
    window.addEventListener("resize", () => {
        if (!isMobile()) {
            // Restore desktop state
            backdrop.classList.remove("visible", "hiding");
            document.body.style.overflow = "";
        }
    });
  
    // Toggle Submenu Logic with Memory
    window.toggleSubmenu = function(event, menuId) {
        event.preventDefault(); 
        
        const submenu = document.getElementById(menuId);
        if (!submenu) return;
    
        const parentItem = submenu.parentElement;
        const isExpanded = parentItem.classList.toggle('expanded');
        
        let sidebarState = JSON.parse(localStorage.getItem('opready_sidebar_state')) || {};
        sidebarState[menuId] = isExpanded;
        localStorage.setItem('opready_sidebar_state', JSON.stringify(sidebarState));
    };

    // Restore Submenu State
    const restoreSidebarState = function() {
        let sidebarState = JSON.parse(localStorage.getItem('opready_sidebar_state')) || {};
        
        for (const [menuId, isExpanded] of Object.entries(sidebarState)) {
            if (isExpanded) {
                const submenu = document.getElementById(menuId);
                if (submenu) {
                    submenu.parentElement.classList.add('expanded');
                }
            }
        }
    };
  
    // Role-Based Access Logic
    const applyRoleBasedAccess = async function() {
        try {
            const response = await fetch('/api/user-session');
            if (!response.ok) throw new Error('Failed to fetch user session');
            
            const user = await response.json();
            const role = user.role || 'guest';
            document.body.setAttribute("data-user-role", role);

            // Update user name in the dropdown and the profile button
            const nameDisplay = document.getElementById("userNameDisplay");
            if (nameDisplay) nameDisplay.textContent = user.name || "User";
            const profileName = document.getElementById("osm-profile-name");
            if (profileName) profileName.textContent = user.name || "User";

            // Define Role Hierarchy
            const roleLevels = {
                'guest': 0,
                'simple': 1,
                'admin': 2,
                'superadmin': 3
            };
            
            const currentLevel = roleLevels[role] || 0;

            // Filter DOM elements based on data-role
            document.querySelectorAll('[data-role]').forEach(item => {
                const requiredRole = item.getAttribute('data-role');
                const requiredLevel = roleLevels[requiredRole] || 0;
                
                if (currentLevel < requiredLevel) {
                    item.style.display = 'none';
                } else {
                    item.style.display = 'block'; // Or flex/list-item depending on original state, block works for li
                }
            });

        } catch (error) {
            console.error('Role verification failed:', error);
            // Fallback: hide restricted items
            document.querySelectorAll('[data-role]').forEach(item => item.style.display = 'none');
        }
    };

    // Initialize state
    // Mobile always starts with sidebar closed and hamburger visible.
    // Desktop restores the last saved preference.
    if (isMobile()) {
        sidebar.classList.add("collapsed");
        openBtn.style.display = "flex";
    } else {
        const wasCollapsed = localStorage.getItem("sidebar-collapsed") === "true";
        toggleSidebar(wasCollapsed);
    }
    
    // Highlight the nav link matching the current page and expand its parent submenus
    const highlightCurrentPage = function() {
        const path = window.location.pathname;
        const page = path === '/' ? '/' : (path.split('/').pop() || '/');
        document.querySelectorAll('#osm-sidebar-nav a').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || href === '#') return;
            const linkPage = href === '/' ? '/' : href.split('/').pop();
            if (linkPage === page) {
                link.classList.add('active');
                // Expand all ancestor submenu groups so the active item is visible
                let submenu = link.closest('.submenu');
                while (submenu) {
                    const parentLi = submenu.parentElement;
                    if (parentLi) parentLi.classList.add('expanded');
                    submenu = parentLi && parentLi.closest('.submenu');
                }
                // Scroll the active item into view after submenu expand transitions finish
                setTimeout(() => {
                    link.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }, 350);
            }
        });
    };

    applyRoleBasedAccess().then(() => {
        restoreSidebarState();
        highlightCurrentPage();
    });
});