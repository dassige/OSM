const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

// Import constants (updated to use skillsConfig instead of skillUrls/enabledSkills)
const {members, skillsConfig, url, transporter, emailInfo } = require('./resources.js');

// --- 1. GLOBAL FLAG DEFINITIONS ---
const args = process.argv.slice(2);
const isTestMode = args.includes('test');
const isViewMode = args.includes('view');
const isSendSelectedMode = args.includes('send-selected');

// Default threshold
let daysThreshold = 30;

// Parse threshold based on mode and argument position
if (isViewMode) {
    // "node main.js view 30" -> 30 is at index 1
    if (args[1] && !isNaN(args[1])) {
        daysThreshold = parseInt(args[1]);
    }
} else if (isSendSelectedMode) {
    // "node main.js send-selected [json] 30" -> 30 is at index 2
    if (args[2] && !isNaN(args[2])) {
        daysThreshold = parseInt(args[2]);
    }
}

// Retrieve allowed names if in selective mode
let allowedNames = [];
if (isSendSelectedMode) {
    try {
        // "node main.js send-selected [json] 30" -> JSON is at index 1
        allowedNames = JSON.parse(args[1]);
    } catch (e) {
        console.error("Error parsing allowed names JSON:", e.message);
        process.exit(1);
    }
}

console.log(`> Configuration: Expiry Threshold set to ${daysThreshold} days.`);

if (isTestMode) {
    console.log('*** RUNNING IN TEST MODE - NO EMAILS WILL BE SENT ***');
}
if (isSendSelectedMode) {
    console.log(`*** RUNNING IN SELECTIVE MODE - Sending to ${allowedNames.length} selected member(s) ***`);
}

let osmData = [];
let allResults = []; // Store results for View Mode

// Helper for formatted timestamps
function getTime() {
    return new Date().toLocaleTimeString();
}

async function getOIData() {
    if (!isViewMode) console.log(`[${getTime()}] Retreiving OI Data from dashboard...`);
    try {
        const response = await axios.get(url, { httpsAgent: new https.Agent({rejectUnauthorized: false }) });
        const $ = cheerio.load(response.data);
        const osmStatusTable = $('tbody');

        let rows = [];
        osmStatusTable.find('tr').each((i, row) => {
            const cols = [];
            $(row).find('td').each((j, col) => {
                cols.push($(col).text().trim());
            });
            if (cols.length > 0) {
                osmData.push({ name: cols[0], skill: cols[1], dueDate: cols[2] })
                rows.push(cols);
            }
        });

        members.forEach((member) => {
            let filteredSkills = osmData.filter((item) => {
                return item.name === member.name;
            })
            member.skills = filteredSkills;
        });
        if (!isViewMode) console.log(`[${getTime()}] OI Data successfully retrieved (${rows.length} records).`);
        return rows;
    } catch (error) {
        console.error(`[${getTime()}] Error fetching OI Data:`, error);
        return null;
    }
}

async function sendEmail(to, text, html) { 
    console.log(`   [${getTime()}] SMTP: Initializing transport...`);
    try {
        const info = await transporter.sendMail({
            from: emailInfo.from,
            to: to,
            subject: emailInfo.subject,
            text: text, // Plain text fallback
            html: html, // HTML version
        });
        console.log(`   [${getTime()}] SMTP: Payload accepted.`);
        console.log(`   [${getTime()}] SMTP: Message ID: ${info.messageId}`);
        console.log(`   [${getTime()}] SMTP: Server Response: ${info.response}`);
    } catch (error) {
        console.error(`   [${getTime()}] SMTP ERROR: Failed to send to ${to}`);
        console.error(`   [${getTime()}] Error Details:`, error.message);
        throw error;
    }
}

async function sendMessage(member) {
    let enableSend = false;
    
    // Initialize Plain Text Message (fallback)
    let message = emailInfo.text;

    // Initialize HTML Message
    let htmlMessage = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #d32f2f;">Expiring Skills Notification</h2>
            <p>Hello, you have expiring Skills due in OSM. Please complete these ASAP:</p>
            <ul>
    `;
    
    if (!isViewMode) {
        console.log(`\n=============================================================`);
        console.log(`PROCESSING MEMBER: ${member.name}`);
        console.log(`=============================================================`);
    }

    if (!member.expiringSkills || member.expiringSkills.length === 0) {
        if (!isViewMode) console.log(`   [${getTime()}] Status: No expiring skills found. Skipping.`);
        return;
    }

    if (!isViewMode) console.log(`   [${getTime()}] Analysis: Found ${member.expiringSkills.length} expiring skill(s).`);

    member.expiringSkills.forEach((skill) => {
        // Find the skill definition in our config
        const skillConfig = skillsConfig.find(config => config.name === skill.skill);
        
        // If the skill is in our config, it is considered "enabled" / actionable
        const isIncluded = !!skillConfig;
        
        if (!isViewMode) {
            console.log(`      - Skill: "${skill.skill}"`);
            console.log(`        Due Date: ${skill.dueDate}`);
            console.log(`        Actionable: ${isIncluded ? 'YES' : 'NO'}`);
            if (skillConfig && skillConfig.critical_skill) {
                console.log(`        CRITICAL: YES`);
            }
        }

        if (isIncluded) {
            // NEW: Construct the full URL by appending the encoded member name
            const fullUrl = `${skill.url}${encodeURIComponent(member.name)}`;

            // Build Plain Text
            message = message + `\r\nSkill: '${skill.skill}' expires on ${skill.dueDate}`;
            message = message + `\r\nTo complete the OI Click here : ${fullUrl}`;

            // Build HTML
            htmlMessage += `
                <li style="margin-bottom: 15px;">
                    <strong>${skill.skill}</strong> ${skillConfig.critical_skill ? '(CRITICAL)' : ''}<br>
                    <span style="color: #666;">Expires on: ${skill.dueDate}</span><br>
                    <a href="${fullUrl}" style="color: #007bff; font-weight: bold; text-decoration: none;">Complete the form here</a>
                </li>
            `;
            
            enableSend = true;
        }
    });
    
    // Close HTML tags
    htmlMessage += `
            </ul>
            <p style="font-size: 12px; color: #888;">This is an automated notification from FENZ OSM Manager.</p>
        </div>
    `;

    if (enableSend) {
        if (isViewMode) {
            // View mode: do nothing
        } else if (isSendSelectedMode && !allowedNames.includes(member.name)) {
            console.log(`   [${getTime()}] Decision: BLOCKED. Member not in user-selected list.`);
        } else if (isTestMode) {
            console.log(`   [${getTime()}] Mode: TEST. Simulating email send.`);
            console.log(`   [${getTime()}] Target: ${member.email}`);
            console.log(`   [${getTime()}] Content Preview (Plain Text):\n   --------------------\n${message.replace(/\r\n/g, '\n   ')}\n   --------------------`);
        } else {
            console.log(`   [${getTime()}] Decision: SENDING. Member is eligible and selected.`);
            console.log(`   [${getTime()}] Target: ${member.email}`);
            try {
                await sendEmail(member.email, message, htmlMessage);
                console.log(`   [${getTime()}] SUCCESS: Notification cycle complete for ${member.name}.`);
            } catch (error) {
                console.error(`   [${getTime()}] FAILURE: Could not complete notification for ${member.name}.`);
            }
        }
    } else {
        if (!isViewMode) console.log(`   [${getTime()}] Decision: NO ACTION. Skills exist but none are in the 'Skills Config' list.`);
    }
}

async function checkExpiringSkills(member) {
    member.expiringSkills = member.skills.filter((skill) => {
        const skillExpiryDate = new Date(skill.dueDate);
        const currentDate = new Date();
        
        const thresholdDate = new Date();
        thresholdDate.setDate(currentDate.getDate() + daysThreshold);

        if (skillExpiryDate <= thresholdDate) {
             // Find matching config in the new skillsConfig array
             const retVal = skillsConfig.find(config => config.name === skill.skill);
             if (retVal) {
                 skill.url = retVal.url;
             }
             // We return true so the skill is added to expiringSkills.
             // sendMessage() will decide later if it's actionable based on whether it was found in skillsConfig.
             return true;
        }
        return false;
    });

    if (member.expiringSkills && member.expiringSkills.length > 0) {
        if (!isViewMode) {
            await sendMessage(member); 
        } else {
            // Check if ANY expiring skill is in our config (isEmailEligible)
            const isEmailEligible = member.expiringSkills.some(s => skillsConfig.some(conf => conf.name === s.skill));
            
            allResults.push({
                name: member.name,
                skills: member.expiringSkills.map(s => ({
                    skill: s.skill,
                    dueDate: s.dueDate,
                    hasUrl: !!s.url // Checks if the URL was found in skillsConfig
                })),
                emailEligible: isEmailEligible
            });
        }
    } else {
        if (isViewMode) {
             allResults.push({
                name: member.name,
                skills: [],
                emailEligible: false
            });
        }
    }
}

async function processOIData(rows) {
    for (const member of members) {
        if (isSendSelectedMode && !allowedNames.includes(member.name)) {
            continue; 
        }

        await checkExpiringSkills(member);
        
        if (!isViewMode) {
             console.log(`   [${getTime()}] Pausing for rate limit safety (5s)...`);
             await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

const main = async () => {
    try {
        const rows = await getOIData();
        if (rows) {
            await processOIData(rows);
            
            if (isViewMode) {
                console.log('___JSON_START___');
                console.log(JSON.stringify(allResults));
                console.log('___JSON_END___');
            } else {
                console.log(`\n[${getTime()}] *** ALL PROCESSES COMPLETED ***`);
            }
        } else {
            console.log('No OI Data retrieved.');
        }
    } catch (error) {
        console.error('Error in main process:', error.message);
    }
}

main();