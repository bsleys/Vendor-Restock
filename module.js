import CONSTANTS from "./constants.js";

Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    if (sheet.actor.type !== "loot" || !game.user.isTrusted || !game.user.can("ACTOR_CREATE")) return;

    buttons.unshift({
        label: game.i18n.localize("VENDOR-RESTOCK.window-title"),
        class: "restock-open",
        icon: "fas fa-shelves",
        onclick: () => {
            new VendorRestock({ actor: sheet.actor }).render({ force: true });
        }
    });
});

class VendorRestock extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "restock",
        tag: "div", 
        classes: ["restock", "categories", "flexcol"],
        window: {
            title: "VENDOR-RESTOCK.window-title",
            icon: "fas fa-shelves"
        },
        position: {
            width: 400,
            height: "auto"
        },
        // Register custom application click actions natively
        actions: {
            submitRestock: VendorRestock.#onRestockClick
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "modules/vendor-restock/templates/restock-form.html"
        }
    };

    /** @override */
    async _prepareContext(options) {
        const flags = this._getFlags(this.actor);
        
        const tables = game.tables.map(table => ({
            key: table.id,
            label: table.name
        }));

        return {
            sheet: this.actor.name,
            tables,
            flags,
        };
    }

    _getFlags(actor) {
        return actor.getFlag(CONSTANTS.MODULE_NAME, CONSTANTS.FLAG_NAME) || CONSTANTS.ACTOR_FLAGS;
    }

    async _setFlags(actor, flags) {
        await actor.setFlag(CONSTANTS.MODULE_NAME, CONSTANTS.FLAG_NAME, flags);
    }

    /**
     * Native Click Handler via data-action
     */
    static async #onRestockClick(event, target) {
        // Stop any browser form triggers instantly
        event.preventDefault();

        // Safely extract the root container element
        const rootElement = this.element;
        
        // Grab values directly by form name attributes safely
        const rolltableId = rootElement.querySelector("[name='tableList']")?.value;
        const rollformula = rootElement.querySelector("[name='rollformula']")?.value;
        const clear = rootElement.querySelector("[name='clearvendor']")?.checked;

        const button = rootElement.querySelector("#vendor-restock-submit");
        if (button) {
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${game.i18n.localize("VENDOR-RESTOCK.working")}`;
            button.disabled = true;
        }

        const flags = { table: rolltableId, formula: rollformula, clear: clear };
        await this._setFlags(this.actor, flags);

        const rolltable = game.tables.get(rolltableId);
        const vendor = this.actor;
        if (!rolltable) {
            ui.notifications.error("Selected RollTable could not be found.");
            this.close();
            return;
        }

        let infiniteStock = false;
        // Safely check if the module is enabled, then extract the value directly from the unvalidated data tree
        if (game.modules.get("pf2e-toolbelt")?.active) {
            const bettermerch = foundry.utils.getProperty(vendor, "flags.pf2e-toolbelt.betterMerchant");
            if (bettermerch) infiniteStock = !!bettermerch.infiniteAll;
        }

        if (clear) {
            const itemIds = vendor.items.map(i => i.id);
            await vendor.deleteEmbeddedDocuments("Item", itemIds);
        }

        const shopQtyRoll = await new Roll(rollformula).evaluate();

        if (shopQtyRoll.total > 0) {
            const draws = await Promise.all(Array.from({ length: shopQtyRoll.total }, () => rolltable.roll()));
            
            for (const draw of draws) {
                const result = draw.results[0]; 
                if (!result) continue;

                // FIXED CASE: Using the official documentUuid field as requested by the V13 engine
                const itemUuid = result.documentUuid || null;
                if (!itemUuid) continue;
                
                const itemData = await fromUuid(itemUuid);
                if (!itemData) continue;

                // Safety verification: Ensure the drawn target document is an actual Item
                if (itemData.documentName !== "Item") {
                    continue;
                }

                const itemExists = vendor.items.find(i => (i.slug && i.slug === itemData.slug) || i.name === itemData.name);

                if (itemExists) {
                    if (!infiniteStock) {
                        const currentQty = foundry.utils.getProperty(itemExists, "system.quantity") || 0;
                        await itemExists.update({ "system.quantity": currentQty + 1 });
                    }
                } else {
                    // Convert to a pure, un-proxied deep-cloned JSON object
                    const itemSource = JSON.parse(JSON.stringify(itemData.toObject()));
                    
                    // Safely strip database tracking parameters
                    delete itemSource._id;
                    delete itemSource.id;
                    if (itemSource.ownership) delete itemSource.ownership;
                    if (itemSource._stats) delete itemSource._stats;

                    // Remove the legacy tracking flag without triggering the proxy getter
                    if (itemSource.flags && typeof itemSource.flags === "object") {
                        if ("exportSource" in itemSource.flags) {
                            delete itemSource.flags.exportSource;
                        }
                        // Clean up the flags parent wrapper if it's completely empty
                        if (Object.keys(itemSource.flags).length === 0) {
                            delete itemSource.flags;
                        }
                    }

                    await vendor.createEmbeddedDocuments("Item", [itemSource]);
                }
            }

            const itemsUpdate = vendor.items.contents
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((item, idx) => ({ _id: item.id, sort: CONST.SORT_INTEGER_DENSITY + idx * 10 }));
                        
            await vendor.updateEmbeddedDocuments("Item", itemsUpdate);
        }

        this.close();
    }
}
