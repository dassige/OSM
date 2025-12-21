# Generating Forms with AI

This guide explains how to use an AI (like Gemini) to generate valid JSON form definitions for the **FENZ OSM Manager** using operational documentation as a source.

## Workflow Overview
1. **Prepare Source Documents:** Gather the technical manuals or operational instructions (OIs) you want to test members on.
2. **Use the Prompt:** Provide the prompt below to an AI along with your documents.
3. **Download JSON:** Save the AI's output as a `.json` file.
4. **Import to Manager:** Go to **Manage Forms** in the web interface and use the "Import into Editor" tool.

---

## Technical Specification Prompt
Copy and paste the text below into an AI chat session. Attach your source documents to the same message.

> **Role:** You are an expert technical analyst for Fire and Emergency New Zealand (FENZ).
>
> **Task:** Analyze the attached document(s) and generate a comprehensive skill verification questionnaire in JSON format.
>
> **JSON Schema Specification:**
> The output must be a single JSON object with these keys:
> - `name`: Concise title for the form (e.g., "OI (IS1) - Operational Safety").
> - `intro`: Brief HTML introduction explaining the purpose.
> - `structure`: An array of question objects, each containing:
>     - `id`: Unique string starting with "fld_" (e.g., "fld_j8x1").
>     - `type`: One of: `text_multi` (Paragraph), `radio` (Single choice), `checkboxes` (Multiple response), or `boolean` (Yes/No).
>     - `description`: The question text (HTML allowed).
>     - `required`: Boolean (set to `true`).
>     - `options`: Array of strings (for `radio` and `checkboxes` only).
>     - `renderAs`: String (`radio` or `dropdown`).
>     - `correctAnswer`: String (or Array for checkboxes) representing the accurate response based on the document.
>
> **Constraint:** Provide ONLY the raw JSON object. No conversational text.

---

## Best Practices
- **Question Variety:** Ensure the documents provide enough detail for at least 5-10 questions.
- **HTML Formatting:** Use `<strong>` and `<ul>` tags in the `intro` and `description` fields to improve readability.
- **Validation:** Always preview the form in the **Forms Manager** after importing to verify formatting and answer keys.