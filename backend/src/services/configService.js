import fs from "fs";

const configPath = "./config/config.json";

export const getConfig = () => {
    return JSON.parse(fs.readFileSync(configPath));
};

export const setConfig = (key, value) => {
    const cfg = getConfig();
    cfg[key] = value;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
};
