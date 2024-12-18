
import CONSTANTS from "./constants.js";

Hooks.once("ready", () => {
    registerSheetButton();
});

function registerSheetButton() {

    if (!game.user.isTrusted) return;

    /**
     * Merchant sheets
     */
    const merchSheetNames = Object.values(CONFIG.Actor.sheetClasses.loot)
        .map((sheetClass) => sheetClass.cls)
        .map((sheet) => sheet.name);

    merchSheetNames.forEach((sheetName) => {
        Hooks.on("render" + sheetName, (app, html, data) => {
            // only for GMs or the owner of this character
            if (!data.owner || !data.actor) return;
            if (!game.user.can("ACTOR_CREATE")) return;

            const button = $(`<a class="restock-open" title="Vendor Restock"><i class="fas fa-shelves"></i>` + game.i18n.format("VENDOR-RESTOCK.window-title") + `</a>`);

            button.click(() => {
                if (game.user.can("ACTOR_CREATE")) {
                    const restock = new VendorRestock(VendorRestock.defaultOptions, data.actor);
                    restock.render(true);
                }
            });

            html.closest('.app').find('.restock-open').remove();
            let titleElement = html.closest('.app').find('.window-title');
            if (!app._minimized) button.insertAfter(titleElement);
        });
    });
}

class VendorRestock extends FormApplication {

    constructor(options, actor) {
        super(options);
        this.actor = game.actors.get(actor.id ? actor.id : actor._id);
    }

    static get defaultOptions() {
        const options = super.defaultOptions;
        options.title = game.i18n.format("VENDOR-RESTOCK.window-title");
        options.template = "modules/vendor-restock/templates/restock.hbs";
        options.classes = ["package-configuration restock"];
        options.id = "restock";
        options.width = 400;
        options.closeOnSubmit = false;
        return options;
    }

    getData() {
        const flags = this.getFlags(this.actor);
        const tables = [];
        this.tables = game.tables.forEach((table) =>{
            tables.push({
                key: table._id,
                label: table.name
            })
        });
        return {
            sheet: this.actor.name,
            tables,
            flags,
        };
    };

    getFlags(actor) {
        const flags = actor.flags[CONSTANTS.FLAG_NAME]
            ? actor.flags[CONSTANTS.FLAG_NAME]
            : CONSTANTS.ACTOR_FLAGS;
        return flags;
    };

    async setFlags(actor, flags) {
        let updateData = {};
        foundry.utils.setProperty(updateData, `flags.${CONSTANTS.FLAG_NAME}`, flags);
        await actor.update(updateData);
        return actor;
    };

    async _updateObject(event, formData) {
        const rolltableId = formData.tableList;
        const rollformula =  formData.rollformula;
        const clear = formData.clearvendor;
        const button = document.getElementById("vendor-restock-submit");

        button.innerHTML = game.i18n.format("VENDOR-RESTOCK.working");
        button.disabled = true;

        //save the forms data to the actor
        const flags ={
            table: rolltableId,
            formula: rollformula,
            clear: clear,
        }        
        await this.setFlags(this.actor, flags);

        const rolltable = game.tables.get(rolltableId);
        const vendor = this.actor;
        
        //check for better merchant ifinite item stacks
        var infiniteStock = false;
        const bettermerch = vendor.flags["pf2e-toolbelt"]?.["betterMerchant"] ? vendor.flags["pf2e-toolbelt"]["betterMerchant"] : null;
        if (bettermerch) infiniteStock = bettermerch.infiniteAll;

        // clear vendor inventory if desired
        if (clear) vendor.deleteEmbeddedDocuments("Item", vendor.items.map(i => i._id));

        let shopQtyRoll = new Roll(rollformula);
        await shopQtyRoll.evaluate();

        if (shopQtyRoll.total > 0) {
            const draws = await Promise.all(Array.from({ length: shopQtyRoll.total }, () => rolltable.roll()));
            for (const draw of draws) {
                const item = await game.packs.get(draw.results[0].documentCollection).getDocument(draw.results[0].documentId);
                const itemExists = vendor.items.find((i) => i.slug === item.slug);
                if (itemExists){
                    if (!infiniteStock){
                        const newQty = itemExists.system.quantity + 1;
                        await itemExists.update({ "system.quantity": newQty });
                    }
                } else {
                    await vendor.createEmbeddedDocuments('Item', [item ] );
                }
            }
            //sort the vendors inventory   
            const items = vendor.items.contents
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((i, x) => ({ _id: i.id, sort: 112500 + x * 15 }));
            await vendor.updateEmbeddedDocuments("Item", items);
        }

        this.close();
    }
}