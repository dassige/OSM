const { processMemberSkills } = require('../services/member-manager');

describe('Member Manager - processMemberSkills', () => {

    it('should correctly merge data and flag a skill that expires within the threshold', () => {
        const dbMembers = [
            { id: 1, name: 'FF John Doe', email: 'john@fenz.osm', enabled: 1 }
        ];
        const dbSkills = [
            { id: 10, name: 'First Aid', url_type: 'internal', url: 'fa-form', critical_skill: 1 , enabled: 1}
        ];

        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 10);
        const formattedDate = `${futureDate.getDate().toString().padStart(2, '0')}/${(futureDate.getMonth() + 1).toString().padStart(2, '0')}/${futureDate.getFullYear()}`;

        const rawScrapedData = [
            { name: 'FF John Doe', skill: 'First Aid', dueDate: formattedDate }
        ];

        const daysThreshold = 30; // 10 days is well within the 30-day warning window
        const trainingMap = {}; 
        const liveFormsMap = { '1_10': 'submitted' }; // Member 1 + Skill 10 has a form under review
        const dynamicBaseUrl = 'https://live.fenz.osm';

        const result = processMemberSkills(
            dbMembers,
            rawScrapedData,
            dbSkills,
            daysThreshold,
            trainingMap,
            liveFormsMap,
            dynamicBaseUrl
        );

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('FF John Doe');
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

        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 60);
        const formattedDate = `${futureDate.getDate().toString().padStart(2, '0')}/${(futureDate.getMonth() + 1).toString().padStart(2, '0')}/${futureDate.getFullYear()}`;

        const rawScrapedData = [{ name: 'Jane Smith', skill: 'Driving', dueDate: formattedDate }];
        const result = processMemberSkills(dbMembers, rawScrapedData, dbSkills, 30, {}, {}, '');

        expect(result).toHaveLength(1);
        expect(result[0].expiringSkills).toHaveLength(0);
    });

    it('should completely ignore members who are disabled in the database', () => {
        // enabled: 0 means they have left the brigade or are on leave
        const dbMembers = [{ id: 3, name: 'Old Member', enabled: 0 }];
        
        // Simulating the scraper still finding them on the live site
        const rawScrapedData = [{ name: 'Old Member', skill: 'Driving', dueDate: '01/01/2020' }];

        const result = processMemberSkills(dbMembers, rawScrapedData, [], 30, {}, {}, '');

        const processedMember = result.find(m => m.name === 'Old Member');
        if (processedMember) {
            expect(processedMember.expiringSkills).toHaveLength(0);
        } else {
            expect(result).not.toContainEqual(expect.objectContaining({ name: 'Old Member' }));
        }
    });

    it('attaches a resolved kbLink/kbTitle when the skill has an active, unexpired linked KB document', () => {
        const dbMembers = [{ id: 4, name: 'FF Jane Roe', enabled: 1 }];
        const dbSkills = [{
            id: 12, name: 'Ladders', url_type: 'external', url: 'https://forms.example.com/ladders', enabled: 1,
            kb_document_id: 7, kb_document_title: 'Ladder Safety Guide', kb_document_slug: 'ABC123',
            kb_document_active: 1, kb_document_expires_at: null,
        }];
        const rawScrapedData = [{ name: 'FF Jane Roe', skill: 'Ladders', dueDate: '01/01/2020' }];

        const result = processMemberSkills(dbMembers, rawScrapedData, dbSkills, 30, {}, {}, 'https://app.example.com');

        const skill = result[0].expiringSkills[0];
        expect(skill.kbLink).toBe('https://app.example.com/knowledgebase/ABC123');
        expect(skill.kbTitle).toBe('Ladder Safety Guide');
    });

    it('does not attach a kbLink when the linked KB document is inactive', () => {
        const dbMembers = [{ id: 5, name: 'FF Sam Poe', enabled: 1 }];
        const dbSkills = [{
            id: 13, name: 'Pumps', url_type: 'external', url: 'https://forms.example.com/pumps', enabled: 1,
            kb_document_id: 8, kb_document_title: 'Pump Guide', kb_document_slug: 'DEF456',
            kb_document_active: 0, kb_document_expires_at: null,
        }];
        const rawScrapedData = [{ name: 'FF Sam Poe', skill: 'Pumps', dueDate: '01/01/2020' }];

        const result = processMemberSkills(dbMembers, rawScrapedData, dbSkills, 30, {}, {}, 'https://app.example.com');

        expect(result[0].expiringSkills[0].kbLink).toBeNull();
    });

    it('does not attach a kbLink when the linked KB document has expired', () => {
        const dbMembers = [{ id: 6, name: 'FF Alex Fox', enabled: 1 }];
        const dbSkills = [{
            id: 14, name: 'Ropes', url_type: 'external', url: 'https://forms.example.com/ropes', enabled: 1,
            kb_document_id: 9, kb_document_title: 'Rope Guide', kb_document_slug: 'GHI789',
            kb_document_active: 1, kb_document_expires_at: '2000-01-01',
        }];
        const rawScrapedData = [{ name: 'FF Alex Fox', skill: 'Ropes', dueDate: '01/01/2020' }];

        const result = processMemberSkills(dbMembers, rawScrapedData, dbSkills, 30, {}, {}, 'https://app.example.com');

        expect(result[0].expiringSkills[0].kbLink).toBeNull();
    });

    it('leaves kbLink null when the skill has no linked KB document', () => {
        const dbMembers = [{ id: 7, name: 'FF Sky Lane', enabled: 1 }];
        const dbSkills = [{ id: 15, name: 'Knots', url_type: 'none', enabled: 1 }];
        const rawScrapedData = [{ name: 'FF Sky Lane', skill: 'Knots', dueDate: '01/01/2020' }];

        const result = processMemberSkills(dbMembers, rawScrapedData, dbSkills, 30, {}, {}, 'https://app.example.com');

        expect(result[0].expiringSkills[0].kbLink).toBeNull();
    });

});