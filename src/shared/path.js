import { MODULE_ID } from "../module";

export function templatePath(...path) {
	const pathStr = path.filter((x) => typeof x === "string").join("/");
	return `modules/${MODULE_ID}/templates/${pathStr}.hbs`;
}
