const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

// Import constants
const {members, skillUrls, enabledSkills, url, transporter, emailInfo } = require('./resources.js');

// --- 1. GLOBAL FLAG DEFINITIONS ---
const args = process.argv.slice(2);
const isTestMode = args.includes('test');
const isViewMode = args.includes('view');
const isSendSelectedMode = args.includes('send-selected');

let allowedNames = [];
if (isSendSelectedMode) {
    try {
        // The argument after 'send-selected' should be the JSON string of names
        const idx = args.indexOf('send-selected');
        if (idx !== -1 && args[idx + 1]) {
            allowedNames = JSON.parse(args[idx + 1]);
        }
    } catch (e) {
        console.error("Error parsing allowed names list:", e.message);
    }
}

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

async function sendEmail(to, text) {
    console.log(`   [${getTime()}] SMTP: Initializing transport...`);
    try {
        const info = await transporter.sendMail({
            from: emailInfo.from,
            to: to,
            subject: emailInfo.subject,
            text: text,
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
    let message = emailInfo.text;
    
    // Skip detailed logs if just viewing
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
        const isIncluded = enabledSkills.includes(skill.skill);
        if (!isViewMode) {
            console.log(`      - Skill: "${skill.skill}"`);
            console.log(`        Due Date: ${skill.dueDate}`);
            console.log(`        Actionable: ${isIncluded ? 'YES' : 'NO'}`);
        }

        if (isIncluded) {
            message = message + `\r\nSkill: '${skill.skill}' expires on ${skill.dueDate}`;
            message = message + `\r\nTo complete the OI Click here : ${skill.url}`;
            enableSend = true;
        }
    });
    
    if (enableSend) {
        if (isViewMode) {
            // View mode: do nothing
        } else if (isSendSelectedMode && !allowedNames.includes(member.name)) {
            console.log(`   [${getTime()}] Decision: BLOCKED. Member not in user-selected list.`);
        } else if (isTestMode) {
            console.log(`   [${getTime()}] Mode: TEST. Simulating email send.`);
            console.log(`   [${getTime()}] Target: ${member.email}`);
            console.log(`   [${getTime()}] Content Preview:\n   --------------------\n${message.replace(/\r\n/g, '\n   ')}\n   --------------------`);
        } else {
            console.log(`   [${getTime()}] Decision: SENDING. Member is eligible and selected.`);
            console.log(`   [${getTime()}] Target: ${member.email}`);
            try {
                await sendEmail(member.email, message);
                console.log(`   [${getTime()}] SUCCESS: Notification cycle complete for ${member.name}.`);
            } catch (error) {
                console.error(`   [${getTime()}] FAILURE: Could not complete notification for ${member.name}.`);
            }
        }
    } else {
        if (!isViewMode) console.log(`   [${getTime()}] Decision: NO ACTION. Skills exist but none are in the 'Enabled Skills' list.`);
    }
}

async function checkExpiringSkills(member) {
    // In view mode we suppress the per-member check logs to keep the "Loading" phase clean
    // or keep them if you want verbose logs even during "View". 
    // Given the prompt, we'll keep detailed logs for the "Send" process primarily.
    
    member.expiringSkills = member.skills.filter((skill) => {
        const skillExpiryDate = new Date(skill.dueDate);
        const currentDate = new Date();
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(currentDate.getMonth() + 1);

        if (skillExpiryDate <= oneMonthLater) {
             const retVal = skillUrls.find(skillUrl => skillUrl.name === skill.skill);
             if (retVal) skill.url = retVal.url;
             return true;
        }
        return false;
    });

    if (member.expiringSkills && member.expiringSkills.length > 0) {
        if (!isViewMode) {
            await sendMessage(member); 
        } else {
            const isEmailEligible = member.expiringSkills.some(s => enabledSkills.includes(s.skill));
            allResults.push({
                name: member.name,
                skills: member.expiringSkills.map(s => ({
                    skill: s.skill,
                    dueDate: s.dueDate
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
    if (!rows || rows.length === 0) {
        console.log('No data to process.');
        return;
    }

    for (const member of members) {
        await checkExpiringSkills(member);
        
        if (!isViewMode) {
            console.log(`   [${getTime()}] Pausing for rate limit safety (15s)...`);
            await new Promise(resolve => setTimeout(resolve, 15000));
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