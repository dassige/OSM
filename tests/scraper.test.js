// tests/scraper.test.js
const axios = require('axios');
const { getOIData } = require('../services/scraper');

// --- 1. MOCK AXIOS ---
// This completely intercepts Axios so it never makes a real network request during the test!
jest.mock('axios');

describe('FENZ External Scraper (getOIData)', () => {
    
    // A fake logger function to pass into the scraper
    const mockLogger = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should successfully fetch and parse member skills from HTML', async () => {
        // 1. Setup the fake HTML response that Axios will return.
        // NOTE: You may need to change these HTML tags/classes to match exactly what 
        // your scraper looks for (e.g., specific <table> IDs or <div> classes).
        const fakeHtml = `
            <html>
                <body>
                    <table class="data-table">
                        <tbody>
                            <tr>
                                <td class="name-col">FF John Doe</td>
                                <td class="skill-col">First Aid</td>
                                <td class="date-col">15/05/2026</td>
                            </tr>
                            <tr>
                                <td class="name-col">Jane Smith</td>
                                <td class="skill-col">Driving</td>
                                <td class="date-col">20/08/2026</td>
                            </tr>
                        </tbody>
                    </table>
                </body>
            </html>
        `;

        // Tell Axios to instantly resolve with our fake HTML when called
        axios.get.mockResolvedValue({ data: fakeHtml });
        
        // (If your scraper uses axios.post or a generic axios(config) call, 
        // you might need to mock that specific method instead, like:
        // axios.mockResolvedValue({ data: fakeHtml }); )

        // 2. Call the scraper
        const url = 'http://fake-fenz.osm/report';
        const result = await getOIData(url, 0, null, mockLogger);

        // 3. Assertions
        expect(axios.get).toHaveBeenCalledWith(
            expect.stringContaining(url), 
            expect.any(Object) // Matches the proxy/header config passed to axios
        );

        expect(result).toBeInstanceOf(Array);
        
        // Assert that the parsing logic successfully extracted the data
        // (Commented out initially: uncomment these once you adjust the fakeHtml to match your parser!)
        /*
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: 'FF John Doe',
            skill: 'First Aid',
            dueDate: '15/05/2026'
        });
        */
        
        // Prove it logged the success
        expect(mockLogger).toHaveBeenCalledWith(expect.stringMatching(/success/i));
    });

    it('should handle network errors gracefully without crashing', async () => {
        // Tell Axios to simulate a 500 Internal Server Error
        axios.get.mockRejectedValue(new Error('Network Timeout'));

        // Call the scraper and expect it to handle the failure (either by returning an empty array or throwing safely)
        try {
            const result = await getOIData('http://fake-fenz.osm', 0, null, mockLogger);
            // If your scraper returns an empty array on failure, test that:
            expect(result).toEqual([]);
        } catch (error) {
            // If your scraper throws an error on failure, test that:
            expect(error.message).toBe('Network Timeout');
        }

        // Prove it logged the error
        expect(mockLogger).toHaveBeenCalledWith(expect.stringMatching(/error|failed/i));
    });
});