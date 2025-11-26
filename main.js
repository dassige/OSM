const axios = require('axios');
const cheerio = require('cheerio');
const { initializeWhatsAppClient, sendMessage } = require('./whatsapp.js');

const members = [
    { "name": "QFF Paulin, N M", "mobile": "64272061827", "skills": [] },
    { "name": "CFO Sweeting-Shaw, P J", "mobile": "64204721553", "skills": [] },
    { "name": "SFF Fouche, C D", "mobile": "6421646254", "skills": [] },
    { "name": "DCFO Milne, D S", "mobile": "64225154321", "skills": [] },
    { "name": "RFF Collins, S B", "mobile": "6421508980", "skills": [] },
    { "name": "FF Mason, J D", "mobile": "6421878400", "skills": [] },
    { "name": "FF Godfrey, D C", "mobile": "64212729289", "skills": [] },
    { "name": "FF Mollier-Alexander, C", "mobile": "6421719328", "skills": [] },
    { "name": "SFF Reilly, L B", "mobile": "64272118327", "skills": [] },
    { "name": "FF Fitzpatrick, R", "mobile": "64221877318", "skills": [] },
    { "name": "QFF Sparrow, M J", "mobile": "64273735998", "skills": [] },
    { "name": "OS-FF Iszard, A M", "mobile": "64211476282", "skills": [] },
    { "name": "SO Laloli, B J", "mobile": "64276002202", "skills": [] },
    { "name": "FF Hunter, W R", "mobile": "64220594566", "skills": [] },
    { "name": "RFF Hyde, C L", "mobile": "642102898974", "skills": [] },
    { "name": "RFF Walmsley, B G", "mobile": "642041601077", "skills": [] },
    { "name": "FF Crawley, P J", "mobile": "6421483114", "skills": [] },
    { "name": "OS-FF Sweeting-Shaw, B", "mobile": "64212562563", "skills": [] },
    { "name": "OS-FF Partington, A C", "mobile": "64212107129", "skills": [] }
]

const skillUrls = [
    { "name": "OI (IS1) - Operational Safety (C)", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUM0VBMVBDU1VXUTI2RlZNSDM2RDZPVFlUMS4u" },
    { "name": "OI (H6-1) - Bulk Flammable Gases", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUM0paSDJGWU45NFhFWllLSFROQzZBS0k4TC4u" },
    { "name": "OI (H5) - Bulk Flammable Liquids", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUQk1ROVVLV0U2T0xMRlJaRkpDQkhMQUtaMy4u" },
    { "name": "OI (FL2-1) - Use of FENZ Operational Vehicles", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUMlBCS1ZIRUk3QVM0SElPQVZCN1oxWTdBNi4u" },
    { "name": "OI (E3-2) - Breathing Apparatus (C)", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUNzJMMlQ0Vk1MQkdYWjhQQlFFUEg5SjdDSC4u" },
    { "name": "OI (G9) - Salvage", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUN0FQN0lJODMxT1NaSVIzSThMUzZYTkxBNy4u" },
    { "name": "OSH - Safe Person Concept (C)", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RURFlDMUY5WURSN0tVMDROTVJYTkMxVTdCNS4u" },
    { "name": "OI (H1-H6) - Hazardous Materials", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUM1FYRlZDV1FVRUpQNks4WDZDVThKOFEzWi4u" },
    { "name": "OI (H6-2) - Portable gas cylinders and pressurised vessels", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUN0VDUjNaOTNTWU03WEhYMUJaS0I5NUJXOC4u" },
    { "name": "OI (G2-1) - Emergency Medical Support", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUMEg2UUQ0VkxYME5RNEUwUTNLQ0ZBSVRNVy4u"},
    { "name": "OI (IS3) - Working Near Roadways (C)", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUNjdIV0lROTRaTEhFTUFFVUdGQjlSQUhRNC4u" },
    { "name": "OI (IS4) - Working Near Electrical Hazards (C)", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUQVFUUTJBRkdSNUxSNFBXUjQzWDlCVlkxVC4u" },
    { "name": "OI (IS9) - Civil Disturbances", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUOExPWlhUSUZHNjQzUFkwVlJFWEJTSE5DWC4u" },
    { "name": "OI (H7-1) - Clandestine Labs", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUN0RWQjRTU0FXQTFVTDRTWFJOVFRWTjBGVi4u" },
    { "name": "OI (G7) - Decontamination", "url": "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUQUwwMk1UMk40MUkyWVlUNUxPNkU0OVdEWC4u" }
]

const enabledSkills = [
    "OI (IS1) - Operational Safety (C)",
    "OI (H6-1) - Bulk Flammable Gases",
    "OI (H5) - Bulk Flammable Liquids",
    "OI (FL2-1) - Use of FENZ Operational Vehicles",
    "OI (E3-2) - Breathing Apparatus (C)",
    "OI (G9) - Salvage",
    "OSH - Safe Person Concept (C)",
    "OI (H1-H6) - Hazardous Materials",
    "OI (H6-2) - Portable gas cylinders and pressurised vessels",
    "OI (G2-1) - Emergency Medical Support",
    "OI (IS3) - Working Near Roadways (C)",
    "OI (IS4) - Working Near Electrical Hazards (C)",
    "OI (IS9) - Civil Disturbances",
    "OI (H7-1) - Clandestine Labs",
    "OI (G7) - Decontamination"
]

let osmData = [];

async function getOIData() {
    console.log('Retreiving OI Data...');
    const url = 'https://www.dashboardlive.nz/osm.php?bu=%7b1527694B-2642-4CEC-B9A8-773CA7B1B6CF%7d';
    // const url = 'http://testutil.work.net.au:8080/dashboard/temp.html';

    try {
        const response = await axios.get(url);
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

async function sendWhatsApp(member) {
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
        
        //await sendMessage(member.mobile, message)
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
            // if (skillExpiryDate <= oneMonthLater) {
                const retVal = skillUrls.find(skillUrl => skillUrl.name === skill.skill);
                if (retVal) skill.url = retVal.url;
            // }
            return skill;
        }
    })

    if (member.expiringSkills && member.expiringSkills.length > 0) {
        console.log(`Found ${member.expiringSkills.length} Expiring Skill(s) for ${member.name}`);
        //await sendWhatsApp(member);
        
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
        await new Promise(resolve => setTimeout(resolve, 15000));  // Wait for 30 seconds
    }
}

const main = async () => {
    try {
        console.log('Initializing WhatsApp client...');
        await initializeWhatsAppClient()
            .then(async () => {
                console.log('WhatsApp client initialized successfully!');
                await getOIData()
                    .then(async (rows) => {
                        if (rows) {
                            await processOIData(rows);
                        } else {
                            console.log('No OI Data retrieved.');
                        }
                    })
                    .catch((err) => {
                        console.error('Error:', err.message);
                    })
            })
            .catch((err) => {
                console.error('Error:', err.message);
            })
    } catch (error) {
        console.error('Error:', error.message);
    }
}
main();