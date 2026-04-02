// tests/member-manager.test.js
const { processMemberSkills } = require('../services/member-manager');

describe('Member Manager - processMemberSkills', () => {

    it('should correctly merge data and flag a skill that expires within the threshold', () => {
        // 1. Setup Fake Database Members
        const dbMembers = [
            { id: 1, name: 'FF John Doe', email: 'john@fenz.osm', enabled: 1 }
        ];

        // 2. Setup Fake Database Skills
        const dbSkills = [
            { id: 10, name: 'First Aid', url_type: 'internal', url: 'fa-form', critical_skill: 1 , enabled: 1}
        ];

        // 3. Create a date 10 days in the future to simulate the Scraper finding an expiring skill
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 10);
        // Format to DD/MM/YYYY (Standard format for your scraper)
        const formattedDate = `${futureDate.getDate().toString().padStart(2, '0')}/${(futureDate.getMonth() + 1).toString().padStart(2, '0')}/${futureDate.getFullYear()}`;

        const rawScrapedData = [
            { name: 'FF John Doe', skill: 'First Aid', dueDate: formattedDate }
        ];

        // 4. Configuration parameters
        const daysThreshold = 30; // 10 days is well within the 30-day warning window!
        const trainingMap = {}; 
        const liveFormsMap = { '1_10': 'submitted' }; // Member 1 + Skill 10 has a form under review
        const dynamicBaseUrl = 'https://live.fenz.osm';

        // Execute the pure function
        const result = processMemberSkills(
            dbMembers,
            rawScrapedData,
            dbSkills,
            daysThreshold,
            trainingMap,
            liveFormsMap,
            dynamicBaseUrl
        );

        // Assertions
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('FF John Doe');
        
        // John should have 1 expiring skill
        expect(result[0].expiringSkills).toHaveLength(1);
        
        const skill = result[0].expiringSkills[0];
        expect(skill.skill).toBe('First Aid');
        expect(skill.skillId).toBe(10);
        expect(skill.isCritical).toBeTruthy();
        
        // It should have successfully mapped the live form status from the dictionary
        expect(skill.liveFormStatus).toBe('submitted');
        
        // It should have attached a URL since the skill has an internal form
        expect(skill.url).toBeDefined();
        expect(typeof skill.url).toBe('string');
    });

    it('should ignore skills that expire OUTSIDE the threshold limit', () => {
        const dbMembers = [{ id: 2, name: 'Jane Smith', enabled: 1 }];
        const dbSkills = [{ id: 11, name: 'Driving', url_type: 'none' }];

        // Create a date 60 days in the future
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 60);
        const formattedDate = `${futureDate.getDate().toString().padStart(2, '0')}/${(futureDate.getMonth() + 1).toString().padStart(2, '0')}/${futureDate.getFullYear()}`;

        const rawScrapedData = [{ name: 'Jane Smith', skill: 'Driving', dueDate: formattedDate }];

        // Threshold is only 30 days
        const result = processMemberSkills(dbMembers, rawScrapedData, dbSkills, 30, {}, {}, '');

        // Jane should be returned, but her expiringSkills array must be empty!
        expect(result).toHaveLength(1);
        expect(result[0].expiringSkills).toHaveLength(0);
    });

    it('should completely ignore members who are disabled in the database', () => {
        // enabled: 0 means they have left the brigade or are on leave
        const dbMembers = [{ id: 3, name: 'Old Member', enabled: 0 }];
        
        // Simulating the scraper still finding them on the live site
        const rawScrapedData = [{ name: 'Old Member', skill: 'Driving', dueDate: '01/01/2020' }];

        const result = processMemberSkills(dbMembers, rawScrapedData, [], 30, {}, {}, '');

        // The manager should strip them out completely or give them 0 skills
        const processedMember = result.find(m => m.name === 'Old Member');
        if (processedMember) {
            expect(processedMember.expiringSkills).toHaveLength(0);
        } else {
            expect(result).not.toContainEqual(expect.objectContaining({ name: 'Old Member' }));
        }
    });

});