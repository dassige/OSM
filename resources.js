const nodemailer = require('nodemailer');

const members = [
    { "name": "QFF Paulin, N M", "email": "me@me.com", "skills": [] },
    { "name": "CFO Sweeting-Shaw, P J", "email": "me@me.com", "skills": [] },
    { "name": "SFF Fouche, C D", "email": "me@me.com", "skills": [] },
    { "name": "DCFO Milne, D S", "email": "me@me.com", "skills": [] },
    { "name": "RFF Collins, S B", "email": "me@me.com", "skills": [] },
    { "name": "FF Mason, J D", "email": "me@me.com", "skills": [] },
    { "name": "FF Godfrey, D C", "email": "me@me.com", "skills": [] },
    { "name": "FF Mollier-Alexander, C", "email": "me@me.com", "skills": [] },
    { "name": "SFF Reilly, L B", "email": "me@me.com", "skills": [] },
    { "name": "FF Fitzpatrick, R", "email": "me@me.com", "skills": [] },
    { "name": "QFF Sparrow, M J", "email": "me@me.com", "skills": [] },
    { "name": "OS-FF Iszard, A M", "email": "me@me.com", "skills": [] },
    { "name": "SO Laloli, B J", "email": "me@me.com", "skills": [] },
    { "name": "FF Hunter, W R", "email": "me@me.com", "skills": [] },
    { "name": "RFF Hyde, C L", "email": "me@me.com", "skills": [] },
    { "name": "RFF Walmsley, B G", "email": "me@me.com", "skills": [] },
    { "name": "FF Crawley, P J", "email": "me@me.com", "skills": [] },
    { "name": "OS-FF Sweeting-Shaw, B", "email": "me@me.com", "skills": [] },
    { "name": "OS-FF Partington, A C", "email": "me@me.com", "skills": [] }
];

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
    { "name": "OI (G2-1) - Emergency Medical Support", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUMEg2UUQ0VkxYME5RNEUwUTNLQ0ZBSVRNVy4u" },
    { "name": "OI (IS3) - Working Near Roadways (C)", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUNjdIV0lROTRaTEhFTUFFVUdGQjlSQUhRNC4u" },
    { "name": "OI (IS4) - Working Near Electrical Hazards (C)", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUQVFUUTJBRkdSNUxSNFBXUjQzWDlCVlkxVC4u" },
    { "name": "OI (IS9) - Civil Disturbances", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUOExPWlhUSUZHNjQzUFkwVlJFWEJTSE5DWC4u" },
    { "name": "OI (H7-1) - Clandestine Labs", "url": "https://forms.office.com/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUN0RWQjRTU0FXQTFVTDRTWFJOVFRWTjBGVi4u" },
    { "name": "OI (G7) - Decontamination", "url": "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=pX8_-1gNx0GqJPcLmyIgxnmVztZMX6FPrvJPWanW91RUQUwwMk1UMk40MUkyWVlUNUxPNkU0OVdEWC4u" }
];

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
];
const url = 'https://www.dashboardlive.nz/osm.php?bu=%7b1527694B-2642-4CEC-B9A8-773CA7B1B6CF%7d';

// --- EMAIL CONFIGURATION ---
// Replace these details with your specific email provider's settings.
// For Gmail, you often need to use an "App Password" instead of your login password.

const transporter = nodemailer.createTransport({
    service: 'gmail', // Use 'gmail' or provide host/port for other SMTP services
    auth: {
        user: 'your_email@gmail.com', // Your email address
        pass: 'your_app_password'      // Your email password or App Password
    }
});
const emailInfo = {
      from: '"FENZ OSM Manager" <your_email@gmail.com>', // Sender address
      subject: "FENZ OSM: Expiring Skills Notification",
      text: "Hello, you have expiring Skills due in OSM. Please complete these ASAP.\r\n" //trailing text
    };

module.exports = {
    members,
    skillUrls,
    enabledSkills,
    url,
    transporter,
    emailInfo
};