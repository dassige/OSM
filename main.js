// main.js
const { getOIData } = require('./services/scraper'); 
const config = require('./config'); 

// Import resources (Legacy support for CLI)
const { members, skillsConfig, transporter, emailInfo } = require('./resources.js');
const { processMemberSkills, isExpired } = require('./services/member-manager');

// --- 1. GLOBAL FLAG DEFINITIONS ---
const args = process.argv.slice(2);
// [REMOVED] Test mode flag
const isViewMode = args.includes('view');
const isSendSelectedMode = args.includes('send-selected');

// Default threshold
let daysThreshold = 30;

// Parse threshold
if (isViewMode) {
    if (args[1] && !isNaN(args[1])) daysThreshold = parseInt(args[1]);
} else if (isSendSelectedMode) {
    if (args[2] && !isNaN(args[2])) daysThreshold = parseInt(args[2]);
}

// Retrieve allowed names if in selective mode
let allowedNames = [];
if (isSendSelectedMode) {
    try {
        allowedNames = JSON.parse(args[1]);
    } catch (e) {
        console.error("Error parsing allowed names JSON:", e.message);
        process.exit(1);
    }
}

console.log(`> Configuration: Expiry Threshold set to ${daysThreshold} days.`);

if (isSendSelectedMode) {
    console.log(`*** RUNNING IN SELECTIVE MODE - Sending to ${allowedNames.length} selected member(s) ***`);
}

let allResults = []; 

function getTime() {
    return new Date().toLocaleTimeString(config.locale, { timeZone: config.timezone });
}

async function sendEmail(to, text, html) { 
    console.log(`   [${getTime()}] SMTP: Initializing transport...`);
    try {
        const info = await transporter.sendMail({
            from: emailInfo.from,
            to: to,
            subject: emailInfo.subject,
            text: text, 
            html: html,
        });
        console.log(`   [${getTime()}] SMTP: Payload accepted.`);
        console.log(`   [${getTime()}] SMTP: Message ID: ${info.messageId}`);
    } catch (error) {
        console.error(`   [${getTime()}] SMTP ERROR: Failed to send to ${to}`);
        console.error(`   [${getTime()}] Error Details:`, error.message);
        throw error;
    }
}

async function sendMessage(member) {
    let enableSend = false;
    let message = emailInfo.text;

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
        const skillConfig = skillsConfig.find(config => config.name === skill.skill);
        const isIncluded = !!skillConfig;
        
        if (!isViewMode) {
            console.log(`      - Skill: "${skill.skill}"`);
            console.log(`        Due Date: ${skill.dueDate}`);
            if (skillConfig && skillConfig.critical_skill) {
                console.log(`        CRITICAL: YES`);
            }
        }

        if (isIncluded) {
            let fullUrl = skill.url || '';
            if (fullUrl) {
                fullUrl = fullUrl
                    .replace(/{{member-name}}/g, encodeURIComponent(member.name))
                    .replace(/{{member-email}}/g, encodeURIComponent(member.email));
            }

            message = message + `\r\nSkill: '${skill.skill}' expires on ${skill.dueDate}`;
            message = message + `\r\nTo complete the OI Click here : ${fullUrl}`;

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
        } else {
            console.log(`   [${getTime()}] Decision: SENDING. Member is eligible and selected.`);
            console.log(`   [${getTime()}] Target: ${member.email}`);
            try {
                await sendEmail(member.email, message, htmlMessage);
                console.log(`   [${getTime()}] SUCCESS: Notification cycle complete.`);
            } catch (error) {
                console.error(`   [${getTime()}] FAILURE: Could not complete notification.`);
            }
        }
    } else {
        if (!isViewMode) console.log(`   [${getTime()}] Decision: NO ACTION. Skills exist but none are in the 'Skills Config' list.`);
    }
}

// Helper: Robust Date Parser (Matches Service Logic)
function parseDate(dateStr) {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();
    if (cleanStr.toLowerCase().includes('expired')) return new Date('1970-01-01');

    const dmy = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dmy) {
        const day = parseInt(dmy[1], 10);
        const month = parseInt(dmy[2], 10) - 1;
        let year = parseInt(dmy[3], 10);
        if (year < 100) year += 2000;
        return new Date(year, month, day);
    }
    const fallback = new Date(cleanStr);
    return isNaN(fallback.getTime()) ? null : fallback;
}

async function checkExpiringSkills(member) {
    member.expiringSkills = member.skills.filter((skill) => {
        const skillExpiryDate = parseDate(skill.dueDate);
        if (!skillExpiryDate) return false;

        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

        if (skillExpiryDate <= thresholdDate) {
             const retVal = skillsConfig.find(config => config.name === skill.skill);
             if (retVal) {
                 skill.url = retVal.url;
                 skill.isCritical = retVal.critical_skill; 
             }
             return true;
        }
        return false;
    });

    if (member.expiringSkills && member.expiringSkills.length > 0) {
        if (!isViewMode) {
            await sendMessage(member); 
        } else {
            const isEmailEligible = member.expiringSkills.some(s => skillsConfig.some(conf => conf.name === s.skill));
            allResults.push({
                name: member.name,
                skills: member.expiringSkills.map(s => ({
                    skill: s.skill,
                    dueDate: s.dueDate,
                    hasUrl: !!s.url, 
                    isCritical: !!s.isCritical 
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

async function processOIData() {
    const targets = isSendSelectedMode 
        ? members.filter(m => allowedNames.includes(m.name))
        : members;

    if (process.send) process.send({ type: 'progress-start', total: targets.length });

    let current = 0;

    for (const member of targets) {
        await checkExpiringSkills(member);
        
        current++;
        if (process.send) {
            process.send({ 
                type: 'progress-tick', 
                current: current, 
                total: targets.length, 
                member: member.name 
            });
        }
        
        if (!isViewMode) {
             console.log(`   [${getTime()}] Pausing for rate limit safety (2s)...`);
             await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

const main = async () => {
    try {
        if (!isViewMode) console.log(`[${getTime()}] Initializing Scraper (Target: ${config.url})`);
        
        const scrapedData = await getOIData(config.url, 0, config.fixedProxyUrl);
        
        if (scrapedData && scrapedData.length > 0) {
            members.forEach((member) => {
                const filteredSkills = scrapedData.filter((item) => {
                    return item.name === member.name;
                });
                member.skills = filteredSkills;
            });

            if (!isViewMode) console.log(`[${getTime()}] Data mapped to ${members.length} members.`);

            await processOIData();
            
            if (isViewMode) {
                console.log('___JSON_START___');
                console.log(JSON.stringify(allResults));
                console.log('___JSON_END___');
            } else {
                console.log(`\n[${getTime()}] *** ALL PROCESSES COMPLETED ***`);
            }
        } else {
            console.log('No OI Data retrieved or empty response.');
        }
    } catch (error) {
        console.error('Error in main process:', error.message);
    }
}

main();