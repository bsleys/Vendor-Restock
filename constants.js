

const CONSTANTS = {
    MODULE_NAME: "vendor-restock",
    MODULE_FULL_NAME: "Vendor Restock",
    FLAG_NAME: "vendor-restock",

    ACTOR_FLAGS: {
        table: undefined,
        formula: undefined,
        clear: undefined,
    },
    GET_DEFAULT_SETTINGS() {
        return foundry.utils.deepClone(CONSTANTS.DEFAULT_SETTINGS);
    },
};

CONSTANTS.DEFAULT_SETTINGS = {
    [CONSTANTS.ACTOR_FLAGS]: {
        formula: "1d20+40",
        clear: true,
    }
};
export default CONSTANTS;
