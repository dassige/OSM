const nodemailer = require('nodemailer');

const members = [
  { "name": "SO Bandy, J", "email": "info@dassi.net", "skills": [] },
  { "name": "SO Brady, D P", "email": "info@dassi.net", "skills": [] },
  { "name": "SO Edwards, M T", "email": "info@dassi.net", "skills": [] },
  { "name": "SO Tucker, W R", "email": "info@dassi.net", "skills": [] },
  { "name": "SFF Garnham, P", "email": "info@dassi.net", "skills": [] },
  { "name": "SFF Keith, A", "email": "info@dassi.net", "skills": [] },
  { "name": "SFF Roberts, G", "email": "info@dassi.net", "skills": [] },
  { "name": "SFF Walkinshaw, M G", "email": "info@dassi.net", "skills": [] },
  { "name": "SFF Whybrow, R J", "email": "info@dassi.net", "skills": [] },
  { "name": "QFF Busch, G", "email": "info@dassi.net", "skills": [] },
  { "name": "QFF Claxton, P J", "email": "info@dassi.net", "skills": [] },
  { "name": "QFF Dassi, G", "email": "info@dassi.net", "skills": [] },
  { "name": "QFF Hansen, S", "email": "info@dassi.net", "skills": [] },
  { "name": "QFF Price, S M", "email": "info@dassi.net", "skills": [] },
  { "name": "FF Ryan, E", "email": "info@dassi.net", "skills": [] },
  { "name": "RFF Calderon Bonilla, C", "email": "info@dassi.net", "skills": [] },
  { "name": "RFF Edwards, M", "email": "info@dassi.net", "skills": [] },
  { "name": "RFF Firestone, F", "email": "info@dassi.net", "skills": [] },
  { "name": "RFF McLoughlin, S C", "email": "info@dassi.net", "skills": [] },
  { "name": "RFF Romeril, C C", "email": "info@dassi.net", "skills": [] }
];

const skillUrls = [
    { "name": "OI (IS1) - Operational Safety (C)", "url": "https://docs.google.com/forms/d/e/1FAIpQLSfIPFllTJsWKaHUUFV5SbvckgmhRpQtKTlT7FVG87pi79pxoA/viewform?usp=pp_url&entry.892262364=" },
    { "name": "OI (H6-1) - Bulk Flammable Gases", "url": "https://docs.google.com/forms/d/e/1FAIpQLSc5oMfRReFeEdhlpULz29J-6qoJSWE3clQWGUEql83NPLOJdA/viewform?usp=pp_url&entry.1609682703=" },
    { "name": "OI (H5) - Bulk Flammable Liquids", "url": "https://docs.google.com/forms/d/e/1FAIpQLSe5_BVFrRsjqstUuutx-eGlYIgKgy2qjw71pkCs42LfyxroNg/viewform?usp=pp_url&entry.214035688=" },
    { "name": "OI (FL2-1) - Use of FENZ Operational Vehicles", "url": "https://docs.google.com/forms/d/e/1FAIpQLScIu9Yjedq0XNZolgzsCTH2fzrc6J7qGeyQn9PGAn5kaRNXCA/viewform?usp=pp_url&entry.653383503=" },
    { "name": "OI (E3-2) - Breathing Apparatus (C)", "url": "https://docs.google.com/forms/d/e/1FAIpQLSeXtRqS5GMPOJEiez42T53sLqAjKSrF6sbQWW6HqDFOPvrgiQ/viewform?usp=pp_url&entry.885055929=" },
    { "name": "OI (G9) - Salvage", "url": "https://docs.google.com/forms/d/e/1FAIpQLSfpPx-Fj2N044Ao0lNbS4WhzPnRQQWgUxeu1kFMuZDGFDwoQg/viewform?usp=pp_url&entry.197149701=" },
    { "name": "OSH - Safe Person Concept (C)", "url": "" },
    { "name": "OI (H1-H6) - Hazardous Materials", "url": "https://docs.google.com/forms/d/e/1FAIpQLSf6IYkY_HMHqc_PHDkMktjvA0iVMWz122lw1SoflWRkG5VHuA/viewform?usp=pp_url&entry.1475319145=" },
    { "name": "OI (H6-2) - Portable gas cylinders and pressurised vessels", "url": "https://docs.google.com/forms/d/e/1FAIpQLSdtA9ojP9QtDDb7Wz6tgWKJdmrH_midob5DotxZfpfE7NTAtg/viewform?usp=pp_url&entry.1434439767=" },
    { "name": "OI (G2-1) - Emergency Medical Support", "url": "https://docs.google.com/forms/d/e/1FAIpQLSfJZG53Kc11JpYkrmfHmQ7K_fC7QcSf5wcohhfOwpiDBWPQ9Q/viewform?usp=pp_url&entry.1618257479=" },
    { "name": "OI (IS3) - Working Near Roadways (C)", "url": "https://docs.google.com/forms/d/e/1FAIpQLScQLGXCucB5djzpCPx73PM6cgZq4XFz3Gn4dSBRF7RQTgch8w/viewform?usp=pp_url&entry.1567131598=" },
    { "name": "OI (IS4) - Working Near Electrical Hazards (C)", "url": "https://docs.google.com/forms/d/e/1FAIpQLSeDy9TVc95JuzuMEycpKnscXc2880gBTPv4UDOCYIhJjI71HA/viewform?usp=pp_url&entry.436448477=" },
    { "name": "OI (IS9) - Civil Disturbances", "url": "https://docs.google.com/forms/d/e/1FAIpQLSfqCyAeBjl_kn4IsLxB6PCthw2cWNxuJ_Un3Z6N3I4yQEW0Ow/viewform?usp=pp_url&entry.325088600=" },
    { "name": "OI (H7-1) - Clandestine Labs", "url": "https://docs.google.com/forms/d/e/1FAIpQLSesZjOhw6J0bj4BPJw3Q3UxPocHCAMPhggs_DwapSKnzc50-w/viewform?usp=pp_url&entry.690920723=" },
    { "name": "OI (G7) - Decontamination", "url": "https://docs.google.com/forms/d/e/1FAIpQLSem73QHh-CDGejwvu6XwIjbAXBkew6xP6qk6nTtjPPa0E71Lg/viewform?usp=pp_url&entry.836103460=" }
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
const url = 'https://www.dashboardlive.nz/index.php?user=0qMLcjMPFEkDwWdbLsOiVV7H8D87oU3SQwkHCyxh';

// --- EMAIL CONFIGURATION ---
// Replace these details with your specific email provider's settings.
// For Gmail, you often need to use an "App Password" instead of your login password.

const transporter = nodemailer.createTransport({
    service: 'gmail', // Use 'gmail' or provide host/port for other SMTP services
    auth: {
        user: 'webmaster@dvfb.org.nz', // Your email address
        pass: 'dfvb!812'      // Your email password or App Password
    }
});
const emailInfo = {
      from: '"FENZ OSM Manager" <webmaster@dvfb.org.nz>', // Sender address
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