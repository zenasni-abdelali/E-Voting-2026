(() => {
    function escapeAuditHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function buildBulletinsAuditRows(bulletins) {
        const list = Array.isArray(bulletins) ? bulletins : [];
        if (!list.length) {
            return '<tr><td colspan="5" class="p-4 text-center text-slate-400 font-sans text-sm">Aucun bulletin enregistré dans cette urne.</td></tr>';
        }
        return list.map((b) => `
            <tr class="border-t border-slate-100 text-[11px] font-mono text-slate-600 align-top">
                <td class="py-2 px-3 text-center font-bold text-slate-400">${b.index}</td>
                <td class="py-2 px-3 break-all text-indigo-600">${escapeAuditHtml(b.hash_bulletin_chiffre || "-")}</td>
                <td class="py-2 px-3 break-all">${escapeAuditHtml(b.signature_bulletin_chiffre || "-")}</td>
                <td class="py-2 px-3 break-all text-slate-700">${escapeAuditHtml(b.cle_publique_electeur || "-")}</td>
                <td class="py-2 px-3 break-all text-indigo-700 font-sans font-semibold">${escapeAuditHtml(b.candidat_choisi || "-")}</td>
            </tr>
        `).join("");
    }

    async function verifyGlobalHash(bulletins, expectedHash) {
        try {
            const hashes = (Array.isArray(bulletins) ? bulletins : [])
                .map((b) => String(b.hash_bulletin_chiffre || "").toLowerCase())
                .filter((h) => h.length === 64)
                .sort();
            const concat = hashes.join("");
            const data = new TextEncoder().encode(concat);
            const digest = await crypto.subtle.digest("SHA-256", data);
            const computed = Array.from(new Uint8Array(digest))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            return computed === String(expectedHash || "").toLowerCase();
        } catch (_) {
            return false;
        }
    }

    function hexToU8(hex) {
        const clean = String(hex || "").replace(/\s/g, "").toLowerCase();
        if (clean.length % 2 !== 0) return new Uint8Array(0);
        const out = new Uint8Array(clean.length / 2);
        for (let i = 0; i < out.length; i++) {
            out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    function wcSpkiBytesFromStored(clePublique) {
        const raw = String(clePublique || "").trim();
        if (!raw.startsWith("WC_P256.")) return null;
        try {
            const b64 = raw.slice("WC_P256.".length);
            const bin = atob(b64);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out;
        } catch (_) {
            return null;
        }
    }

    async function sha256HexOfBytes(u8) {
        const digest = await crypto.subtle.digest("SHA-256", u8);
        return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    async function verifyElectorBulletinSignature(clePublique, bulletinHex, signatureHex) {
        try {
            const spki = wcSpkiBytesFromStored(clePublique);
            const bulletin = hexToU8(bulletinHex);
            const signature = hexToU8(signatureHex);
            if (!spki || !bulletin.length || !signature.length) return false;
            const key = await crypto.subtle.importKey(
                "spki",
                spki,
                { name: "ECDSA", namedCurve: "P-256" },
                false,
                ["verify"]
            );
            return await crypto.subtle.verify(
                { name: "ECDSA", hash: "SHA-256" },
                key,
                signature,
                bulletin
            );
        } catch (_) {
            return false;
        }
    }

    async function verifyBulletinHashConsistency(bulletinHex, expectedHashHex) {
        const bulletin = hexToU8(bulletinHex);
        if (!bulletin.length) return false;
        const computed = (await sha256HexOfBytes(bulletin)).toLowerCase();
        const expected = String(expectedHashHex || "").replace(/\s/g, "").toLowerCase();
        return expected.length === 64 && computed === expected;
    }

    function isAffichageComplet(source) {
        if (!source) return false;
        const code = (
            typeof source === "string"
                ? source
                : source.affichage_resultats || ""
        ).toLowerCase().trim();
        if (code === "complet") return true;
        if (code === "partielle" || code === "partiel" || code === "graphiques_barres") {
            return false;
        }
        if (typeof source === "object") {
            return String(source.affichage_resultats_label || "").toLowerCase().trim() === "complet";
        }
        return false;
    }

    window.verifyGlobalHash = verifyGlobalHash;
    window.buildBulletinsAuditRows = buildBulletinsAuditRows;
    window.isAffichageComplet = isAffichageComplet;
    window.verifyElectorBulletinSignature = verifyElectorBulletinSignature;
    window.verifyBulletinHashConsistency = verifyBulletinHashConsistency;
})();
