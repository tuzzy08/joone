import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
  });

  const messagesGrouped = [
    new SystemMessage("You are a helpful assistant."),
    new SystemMessage("Also, be concise."),
    new HumanMessage("Hello!"),
  ];

  try {
    await model.invoke(messagesGrouped);
    console.log("Success: Grouped SystemMessages at the start work perfectly.");
  } catch (e: any) {
    console.error("Grouped systems failed:", e.message);
  }

  const messagesMidstream = [
    new SystemMessage("You are a helpful assistant."),
    new HumanMessage("Hello!"),
    new SystemMessage("System recovery hint here."),
    new HumanMessage("What did I say?"),
  ];

  try {
    await model.invoke(messagesMidstream);
    console.log("Success: Mid-stream SystemMessages work.");
  } catch (e: any) {
    console.error("Midstream systems failed:", e.message);
  }
}

main();
