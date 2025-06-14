const express = require("express");
const router = express.Router();
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const Routine = require("../models/Routine");

// Initialize Gemini model with safety settings
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ],
});

// Static questions for routine generation
const routineQuestions = [
  "What time do you usually wake up in the morning?",
  "What time do you usually go to bed at night?",
  "Do you have any specific health conditions or concerns?",
  "What is your current activity level? (sedentary, light, moderate, very active)",
  "What are your main health and wellness goals?",
  "Do you have any dietary restrictions or preferences?",
  "How much time can you dedicate to exercise daily?",
  "Do you have any specific stress management needs?",
  "What is your work schedule like?",
  "Do you have any specific sleep issues or requirements?",
];

// Get questions endpoint
router.get("/questions", (req, res) => {
  console.log("GET /api/v1/routine/questions called");
  res.json({
    success: true,
    data: {
      questions: routineQuestions,
    },
  });
});

// Get current routine endpoint
router.post("/current", async (req, res) => {
  console.log("GET /api/v1/routine/current called with body:", req.body);
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required in the request body",
      });
    }
    const routine = await Routine.findOne({ userId }).sort({ updatedAt: -1 });
    if (!routine) {
      return res.status(404).json({
        success: false,
        error: "No routine found for this user",
      });
    }
    res.json({
      success: true,
      data: {
        routine: routine.routine,
        createdAt: routine.createdAt,
        updatedAt: routine.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching routine:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch routine",
      details: error.message,
    });
  }
});

// Generate routine endpoint
router.post("/generate", async (req, res) => {
  console.log("POST /api/v1/routine/generate called with body:", req.body);
  try {
    const { answers, userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    if (
      !answers ||
      !Array.isArray(answers) ||
      answers.length !== routineQuestions.length
    ) {
      return res.status(400).json({
        success: false,
        error: "Please provide answers for all questions",
      });
    }

    // Format answers for the prompt
    const formattedAnswers = routineQuestions
      .map((question, index) => {
        return `Q: ${question}\nA: ${answers[index]}`;
      })
      .join("\n\n");

    const promptText =
      "You are Dr. Early Pulse, a wellness expert. " +
      "Based on the user's answers, generate a personalized list of daily tasks. " +
      'Output **only** a JSON array of strings, e.g. ["Wake up at 6:30 AM","Drink water","..."]. ' +
      "Do not wrap it in any extra text or markdown.\n\n" +
      "User's answers:\n" +
      formattedAnswers;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
    });

    const response = result.response;
    let raw = response.text().trim();

    // Remove any leading/trailing triple-backtick fences
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*/, "");
      raw = raw.replace(/\s*```$/, "");
    }

    console.log("Raw response from AI model:", raw);
    // Parse the JSON response
    let routineTasks;
    try {
      routineTasks = JSON.parse(raw);
      if (
        !Array.isArray(routineTasks) ||
        !routineTasks.every((t) => typeof t === "string")
      ) {
        throw new Error("Parsed value is not an array of strings");
      }
    } catch (error) {
      console.error("JSON parse error:", raw, error);
      return res.status(500).json({
        success: false,
        error: "Failed to generate routine",
        details: "Invalid response format from AI model",
      });
    }

    // Save the routine to MongoDB
    try {
      // Find and update existing routine, or create new if doesn't exist
      const routineDoc = await Routine.findOneAndUpdate(
        { userId },
        {
          routine: routineTasks,
          updatedAt: new Date(),
        },
        {
          new: true, // Return the updated document
          upsert: true, // Create if doesn't exist
        }
      );

      res.json({
        success: true,
        data: {
          routine: routineDoc.routine,
          createdAt: routineDoc.createdAt,
          updatedAt: routineDoc.updatedAt,
        },
      });
    } catch (error) {
      console.error("Error saving routine:", error);
      res.status(500).json({
        success: false,
        error: "Failed to save routine",
        details: error.message,
      });
    }
  } catch (error) {
    console.error("Error generating routine:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate routine",
      details: error.message,
    });
  }
});

module.exports = router;
