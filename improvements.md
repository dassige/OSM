
# Future Improvements

IMPROVEMENTS:
- save all the templates and upload in github under /examples/templates
- Forms:
    Investigate AI api for evaluating the text answer 
	Investigate AI api for generating a questions form against a pdf document
- Add blocked status for user after a number of wrong logins, from env var
- comprehensive check for security. (xcross and sql/code injection in forms)
- REFACTOR : 
    remove all [NEW] and [UPDATE] and "fix" from code
	review all the events log payload
	cleanup/consolidate all the db ALTER for migration or upgrade to the db
- ON-HOLD: messenger on hold until I understand the Meta configuration
- automations (careful with usage time in Google Cloud Run)
- Investigate direct API to query FENZ OSM
