// public/js/sidebar.js

document.addEventListener("DOMContentLoaded", () => {
  // SVG Icons
  const iconMenu = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
  const iconClose = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;

  const sidebarHTML = `
        <button id="osm-open-btn" class="osm-icon-btn">${iconMenu}</button>
        <div id="osm-sidebar-container">
            <div class="sidebar-header">
                <button id="osm-close-btn" class="osm-icon-btn">${iconClose}</button>
            </div>
            <nav id="osm-sidebar-nav">
                <ul class="osm-menu">
                    <li><a href="/">Home</a></li>
                    
                    <li class="has-children" id="groupOperations">
                        <div class="menu-label">Operations</div>
                        <ul class="submenu">
                            <li class="has-children">
                                <div class="menu-label">Maintenance</div>
                                <ul class="submenu">
                                    <li><a href="members.html" id="navManageMembers">Manage Members</a></li>
                                    <li><a href="skills.html" id="navManageSkills">Manage Skills</a></li>
                                    <li><a href="forms-manage.html" id="navManageForms">Manage Forms</a></li>
                                </ul>
                            </li>
                            <li><a href="training-planner.html" id="navTrainingPlanner">Renewal Planner</a></li>
                            <li><a href="live-forms.html" id="navLiveForms">Live Forms</a></li>
                        </ul>
                    </li>

                    <li class="has-children" id="groupComms" style="display:none;">
                        <div class="menu-label">Communication</div>
                        <ul class="submenu">
                            <li><a href="templates.html" id="navEmailTemplates">Templates</a></li>
                            <li><a href="third-parties.html" id="navThirdParties">Third Party (WhatsApp)</a></li>
                        </ul>
                    </li>

                    <li class="has-children" id="groupReports" style="display:none;">
                        <div class="menu-label">Reports & Logs</div>
                        <ul class="submenu">
                            <li><a href="reports.html" id="navReports">Reports</a></li>
                            <li><a href="statistics.html" id="navStats">Statistics</a></li>
                            <li><a href="event-log.html" id="navEventLog">Event Log</a></li>
                        </ul>
                    </li>

                    <li class="has-children" id="groupSystem" style="display:none;">
                        <div class="menu-label">System Admin</div>
                        <ul class="submenu">
                            <li><a href="users.html" id="navManageUsers">Manage Users</a></li>
                            <li><a href="system-tools.html" id="navSystemTools">System Tools</a></li>
                        </ul>
                    </li>
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

  // Nested Dropdown Logic
  document.querySelectorAll(".menu-label").forEach((label) => {
    label.addEventListener("click", (e) => {
      const parentLi = label.parentElement;
      parentLi.classList.toggle("active");

      // Close other sibling menus at the same level
      const siblings = parentLi.parentElement.children;
      for (let sibling of siblings) {
        if (sibling !== parentLi) {
          sibling.classList.remove("active");
        }
      }
    });
    fetch("/api/user-session")
      .then((r) => r.json())
      .then((user) => {
        // Update user name if the element exists on the page
        const nameDisplay = document.getElementById("userNameDisplay");
        if (nameDisplay) nameDisplay.textContent = user.name || "User";

        const role = user.role || "guest";

        // --- GLOBAL ROLE BASED MENU VISIBILITY ---
        const groups = {
          operations: document.getElementById("groupOperations"),
          comms: document.getElementById("groupComms"),
          reports: document.getElementById("groupReports"),
          system: document.getElementById("groupSystem"),
        };

        if (role === "superadmin" || role === "admin") {
          if (groups.operations) groups.operations.style.display = "block";
          if (groups.comms) groups.comms.style.display = "block";
          if (groups.reports) groups.reports.style.display = "block";
          if (groups.system) groups.system.style.display = "block";

          // Hide specific tools for standard admins if necessary
          if (role === "admin" && document.getElementById("navSystemTools")) {
            document.getElementById("navSystemTools").style.display = "none";
          }
        } else if (role === "simple") {
          if (groups.reports) groups.reports.style.display = "block";
          const eventLog = document.getElementById("navEventLog");
          if (eventLog) eventLog.style.display = "none";
        }

        document.body.setAttribute("data-user-role", role);
      })
      .catch((err) => {
        console.error("Sidebar session fetch failed:", err);
        // Optional: Redirect to login if session is invalid
        // window.location.href = '/login.html';
      });
  });

  const wasCollapsed = localStorage.getItem("sidebar-collapsed") === "true";
  toggleSidebar(wasCollapsed);
});
