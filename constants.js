

const CONSTANTS = {
    MODULE_NAME: "vendorrestock",
    MODULE_FULL_NAME: "Vendor Restock",
    FLAG_NAME: "vendorrestock",

    ACTOR_FLAGS: {
        table: undefined,
        formula: undefined,
    },
    GET_DEFAULT_SETTINGS() {
        return foundry.utils.deepClone(CONSTANTS.DEFAULT_SETTINGS);
    },
};

CONSTANTS.DEFAULT_SETTINGS = {
    [CONSTANTS.ACTOR_FLAGS]: {
        formula: "1d20+40",
    }
};
export default CONSTANTS;