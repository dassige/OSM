const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

// Import constants
const {members, skillUrls, enabledSkills, url, transporter, emailInfo } = require('./resources.js');

// --- 1. GLOBAL FLAG DEFINITIONS ---
const args = process.argv.slice(2);
const isTestMode = args.includes('test');
const isViewMode = args.includes('view');

if (isTestMode) {
    console.log('*** RUNNING IN TEST MODE - NO EMAILS WILL BE SENT ***');
}

let osmData = [];
let allResults = []; // Store results for View Mode

async function getOIData() {
    if (!isViewMode) console.log('Retreiving OI Data...');
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
        if (!isViewMode) console.log('OI Data retrieved!');
        return rows;
    } catch (error) {
        console.error('Error fetching OI Data:', error);
        return null;
    }
}

async function sendEmail(to, text) {
    try {
        const info = await transporter.sendMail({
            from: emailInfo.from,
            to: to,
            subject: emailInfo.subject,
            text: text,
        });
        console.log(`Email sent to ${to}: ${info.messageId}`);
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error);
        throw error;
    }
}

async function sendMessage(member) {
    let enableSend = false;
    if (!isViewMode) console.log(`Sending message to ${member.name}...`);
    let message = emailInfo.text;
    
    if (!member.expiringSkills) return;

    member.expiringSkills.forEach((skill) => {
        if (enabledSkills.includes(skill.skill)) {
            message = message + `\r\nSkill: '${skill.skill}' expires on ${skill.dueDate}`;
            message = message + `\r\nTo complete the OI Click here : ${skill.url}`;
            enableSend = true;
        }
    });
    
    if (enableSend) {
        if (isViewMode) {
            // In view mode, we don't send, we just report
        } else if (isTestMode) {
            console.log(`[TEST MODE] Would send email to: ${member.email}`);
            console.log(`[TEST MODE] Message content: \n${message}\n`);
        } else {
            console.log('Sending email...')
            try {
                await sendEmail(member.email, message);
                console.log(`Message successfully sent to ${member.name}`);
            } catch (error) {
                console.error(`Error sending to ${member.name}:`, error.message);
            }
        }
    }
}

async function checkExpiringSkills(member) {
    if (!isViewMode) console.log(`Checking ${member.name} for Expiring Skills...`);

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
            console.log(`Found ${member.expiringSkills.length} Expiring Skill(s) for ${member.name}`);
            await sendMessage(member); 
        } else {
            // --- NEW: Calculate Eligibility based on enabledSkills ---
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
        if (!isViewMode) console.log(`No Expiring Skills for ${member.name}`);
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
            console.log("Waiting...");
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
            }
        } else {
            console.log('No OI Data retrieved.');
        }
    } catch (error) {
        console.error('Error in main process:', error.message);
    }
}

main();