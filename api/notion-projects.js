import { handleNotionProjectsNodeRequest } from "../server/notion-projects-handler.js";

export default async function handler(req, res) {
  await handleNotionProjectsNodeRequest(req, res, process.env);
}
