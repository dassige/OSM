/**
 * kb-resolver.js
 * Resolves {{kb:N}} placeholders inserted by the TinyMCE KB Link button.
 *
 * Placeholder format stored in DB:
 *   <a href="{{kb:123}}" data-kb-id="123" class="kb-doc-link">Title</a>
 *
 * Exposes:
 *   window.resolveKbLinks(containerElement) — async, mutates hrefs in the DOM
 *
 * Called by forms-view.html and surveys-view.html after injecting HTML into the DOM.
 * Uses the document's integer id (not the slug) so links survive slug rotation.
 */
window.resolveKbLinks = async function (container) {
    if (!container) return;

    const links = Array.from(container.querySelectorAll('[data-kb-id]'));
    if (!links.length) return;

    // Collect unique IDs
    const ids = [...new Set(links.map(l => l.dataset.kbId))];

    // Fetch in parallel (resolve endpoint is public — no auth needed)
    const resolved = {};
    await Promise.all(ids.map(async id => {
        try {
            const res = await fetch(`/api/knowledgebase/resolve/${id}`);
            if (res.ok) resolved[id] = await res.json();
        } catch { /* silently skip unresolvable IDs */ }
    }));

    // Update each link element in the DOM
    links.forEach(link => {
        const doc = resolved[link.dataset.kbId];
        if (doc) {
            link.href   = `/knowledgebase/${doc.slug}`;
            link.target = '_blank';
            link.rel    = 'noopener noreferrer';
            // Keep the visible text as-is (editor may have customised it)
        } else {
            // Document deleted or inactive — neutralise the link
            link.removeAttribute('href');
            link.style.textDecoration = 'line-through';
            link.style.color          = 'var(--text-muted, #888)';
            link.title = 'This Knowledge Base document is no longer available.';
        }
    });
};
