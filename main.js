const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

// Import constants from the new resource file
const { members, skillUrls, enabledSkills } = require('./resources.js');

let osmData = [];

async function getOIData() {
    console.log('Retreiving OI Data...');
    

    try {
     
        const response = await axios.get(url, { httpsAgent: new https.Agent({rejectUnauthorized: false })
        });
            
         const $ = cheerio.load(response.data);

        // Select all <tbody> tags
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

        // Add all skills to each member
        members.forEach((member) => {
            let filteredSkills = osmData.filter((item) => {
                return item.name === member.name;
            })
            member.skills = filteredSkills;
        });
        console.log('OI Data retrieved!');
        return rows; // Ensure rows are returned from the function
    } catch (error) {
        console.error('Error fetching OI Data:', error);
        return null; // Return null or an empty array if there's an error
    }
}

async function sendMessage(member) {
    let enableSend = false;
    console.log(`Sending message to ${member.name}...`);
    let message = 'Hello, you have expiring Skills due in OSM. Please complete these ASAP.\r\n'
    member.expiringSkills.forEach((skill) => {
        if (enabledSkills.includes(skill.skill)) {
            message = message + `\r\nSkill: '${skill.skill}' expires on ${skill.dueDate}`;
            message = message + `\r\nTo complete the OI Click here : ${skill.url}`;
            enableSend = true;
        }
    });
    console.log(message);
    
    if (enableSend){
        console.log('Sending')
        
        //await sendEmail(member.email, message)
        .then(() => {
            console.log(`Message sent to ${member.name}`);
        })
        .catch((error) => {
            console.error(error, error.message);
        })
    }
}

async function checkExpiringSkills(member) {
    console.log(`Checking ${member.name} for Expiring Skills...`);

    member.expiringSkills = member.skills.filter((skill) => {
        const skillExpiryDate = new Date(skill.dueDate);
        const currentDate = new Date();
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(currentDate.getMonth() + 1);

        if (skillExpiryDate <= oneMonthLater) {
                 const retVal = skillUrls.find(skillUrl => skillUrl.name === skill.skill);
                if (retVal) skill.url = retVal.url;
            return skill;
        }
    })

    if (member.expiringSkills && member.expiringSkills.length > 0) {
        console.log(`Found ${member.expiringSkills.length} Expiring Skill(s) for ${member.name}`);
        // await sendEmail(member); 
        
    }
    else console.log(`No Expiring Skills for ${member.name}`);
}

async function processOIData(rows) {
    if (!rows || rows.length === 0) {
        console.log('No data to process.');
        return;
    }

    for (const member of members) {
        await checkExpiringSkills(member);  // Wait for checkExpiringSkills to finish
        console.log("Waiting...");
        await new Promise(resolve => setTimeout(resolve, 15000));  // Wait for 15 seconds
    }
}

const main = async () => {
    try {
        // Directly fetch data without initializing WhatsApp
        const rows = await getOIData();
        
        if (rows) {
            await processOIData(rows);
        } else {
            console.log('No OI Data retrieved.');
        }

    } catch (error) {
        console.error('Error in main process:', error.message);
    }
}
main();