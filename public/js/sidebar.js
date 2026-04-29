// public/js/sidebar.js

document.addEventListener("DOMContentLoaded", () => {
    // SVG Icons
    const iconMenu = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
    const iconClose = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
  
    // Sidebar HTML Structure with memory IDs and role attributes
    const sidebarHTML = `
          <button id="osm-open-btn" class="osm-icon-btn" title="Open Menu">${iconMenu}</button>
          <div id="osm-sidebar-container">
              <div class="sidebar-header">
                  <button id="osm-close-btn" class="osm-icon-btn">${iconClose}</button>
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
                          <div class="menu-label" onclick="toggleSubmenu(event, 'submenuReports')">Reports & Logs</div>
                          <ul id="submenuReports" class="submenu">
                              <li><a href="reports.html" id="navReports">Reports</a></li>
                              <li><a href="statistics.html" id="navStats">Statistics</a></li>
                              <li data-role="admin"><a href="event-log.html" id="navEventLog">Event Log</a></li>
                          </ul>
                      </li>
  
                      <li class="has-children" id="groupSystem" data-role="superadmin">
                          <div class="menu-label" onclick="toggleSubmenu(event, 'submenuSystem')">System Admin</div>
                          <ul id="submenuSystem" class="submenu">
                              <li><a href="users.html" id="navManageUsers">Manage Users</a></li>
                              <li><a href="system-tools.html" id="navSystemTools">System Tools</a></li>
                          </ul>
                      </li>
                      <li><a href="profile.html">User Preferences</a></li>
                      <li><a href="#" onclick="showAboutModal()">About</a></li>
                  </ul>
              </nav>
          </div>
      `;
  
    document.body.insertAdjacentHTML("afterbegin", sidebarHTML);
  
    const sidebar = document.getElementById("osm-sidebar-container");
    const openBtn = document.getElementById("osm-open-btn");
    const closeBtn = document.getElementById("osm-close-btn");
  
    // Sidebar Toggle
    const toggleSidebar = (isCollapsed) => {
      if (isCollapsed) {
        sidebar.classList.add("collapsed");
        document.body.classList.add("osm-no-margin");
        openBtn.style.display = "flex";
      } else {
        sidebar.classList.remove("collapsed");
        document.body.classList.remove("osm-no-margin");
        openBtn.style.display = "none";
      }
      localStorage.setItem("sidebar-collapsed", isCollapsed);
    };
  
    openBtn.addEventListener("click", () => toggleSidebar(false));
    closeBtn.addEventListener("click", () => toggleSidebar(true));
  
    // Toggle Submenu Logic with Memory
    window.toggleSubmenu = function(event, menuId) {
        event.preventDefault(); 
        
        const submenu = document.getElementById(menuId);
        if (!submenu) return;
    
        const parentItem = submenu.parentElement;
        const isExpanded = parentItem.classList.toggle('expanded');
        
        let sidebarState = JSON.parse(localStorage.getItem('fenz_sidebar_state')) || {};
        sidebarState[menuId] = isExpanded;
        localStorage.setItem('fenz_sidebar_state', JSON.stringify(sidebarState));
    };

    // Restore Submenu State
    const restoreSidebarState = function() {
        let sidebarState = JSON.parse(localStorage.getItem('fenz_sidebar_state')) || {};
        
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

            // Update user name if the element exists
            const nameDisplay = document.getElementById("userNameDisplay");
            if (nameDisplay) nameDisplay.textContent = user.name || "User";

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
    const wasCollapsed = localStorage.getItem("sidebar-collapsed") === "true";
    toggleSidebar(wasCollapsed);
    
    applyRoleBasedAccess().then(() => {
        restoreSidebarState();
    });
});