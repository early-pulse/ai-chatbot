require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const axios = require("axios");
const routineRoutes = require("./src/routes/routineRoutes");

const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple middleware for future auth implementation if needed
const verifyAuth = async (req, res, next) => {
  next();
};

// Configure Google Generative AI
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("GEMINI_API_KEY is not set in .env file.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

// Helper function to check if the message is health-related
async function isHealthRelated(message) {
  try {
    // Ask Gemini to determine if the message is health-related
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Determine if this message is related to healthcare, medicine, wellness, or health. Only respond with 'true' or 'false': "${message}"`,
            },
          ],
        },
      ],
    });
    const response = result.response.text().toLowerCase().trim();
    return response === "true";
  } catch (error) {
    console.error("Error checking health relevance:", error);
    return false;
  }
}

// Initialize Gemini model with safety settings
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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return cb(new Error("Only image files are allowed!"), false);
    }
    cb(null, true);
  },
});

// Helper function to convert image file to Base64
function fileToGenerativePart(filePath, mimeType) {
  try {
    const imageData = fs.readFileSync(filePath);
    return {
      inlineData: {
        data: Buffer.from(imageData).toString("base64"),
        mimeType,
      },
    };
  } catch (error) {
    console.error("Error reading file:", error);
    throw new Error("Could not read image file.");
  }
}

// Text-only chat endpoint
app.post("/api/chat", verifyAuth, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    // Check if the message is health-related
    const healthRelated = await isHealthRelated(message);
    if (!healthRelated) {
      return res.status(400).json({
        success: false,
        error:
          "I am designed to assist with health-related queries only. Please ask questions about health, medicine, wellness, or medical topics.",
      });
    }

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Please provide a response to this health-related query in the following format:
          - Each main point should be a separate, complete sentence
          - If there are related subpoints, include them in the same sentence using appropriate connecting words (and, additionally, moreover, including, such as, etc.)
          - Do not use bullet points, markdown, or special formatting
          - Each point should be on a new line
          - Keep the points concise but informative
          Query: ${message}`,
            },
          ],
        },
      ],
    });

    const response = result.response;
    const text = response.text();

    // Process and clean up the response
    const points = text
      .split("\n")
      .filter((line) => line.trim())
      .map((point) => {
        // Remove markdown formatting and clean up the text
        return point
          .replace(/\*\*/g, "") // Remove bold
          .replace(/\*/g, "") // Remove italics
          .replace(/^[-•*]\s*/, "") // Remove bullet points
          .replace(/^#+\s*/, "") // Remove headers
          .replace(/\s+/g, " ") // Normalize spaces
          .trim();
      })
      .filter((point) => point && !point.match(/^[:#\-=]/)) // Remove separator lines and empty points
      .filter((point) => point.length > 10); // Remove very short lines that might be headers or incomplete points

    res.json({
      success: true,
      data: {
        points: points,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get response from Gemini API",
      details: error.message,
    });
  }
});

// Image and text chat endpoint
app.post(
  "/api/chat-with-image",
  verifyAuth,
  upload.single("image"),
  async (req, res) => {
    const userText = req.body.message;
    const imageFile = req.file;

    if (!userText && !imageFile) {
      return res.status(400).json({
        success: false,
        error: "Please provide either text or an image.",
      });
    }

    // Check if the message is health-related when text is provided
    if (userText) {
      const healthRelated = await isHealthRelated(userText);
      if (!healthRelated) {
        // Clean up the temporary file if exists
        if (imageFile && fs.existsSync(imageFile.path)) {
          fs.unlinkSync(imageFile.path);
        }
        return res.status(400).json({
          success: false,
          error:
            "I am designed to assist with health-related queries only. Please ask questions about health, medicine, wellness, or medical topics.",
        });
      }
    }

    let parts = [];
    if (userText) {
      parts.push({ text: userText });
    }

    if (imageFile) {
      try {
        const imagePart = fileToGenerativePart(
          imageFile.path,
          imageFile.mimetype
        );
        parts.push(imagePart);
      } catch (error) {
        // Clean up the temporary file if processing fails
        if (fs.existsSync(imageFile.path)) {
          fs.unlinkSync(imageFile.path);
        }
        return res.status(500).json({
          success: false,
          error: "Failed to process image file.",
          details: error.message,
        });
      }
    }

    try {
      // Add the formatting instruction to the user's message if it exists
      if (userText) {
        parts[0].text = `Please provide a response to this health-related query in the following format:
          - Each main point should be a separate, complete sentence
          - If there are related subpoints, include them in the same sentence using appropriate connecting words (and, additionally, moreover, including, such as, etc.)
          - Do not use bullet points, markdown, or special formatting
          - Each point should be on a new line
          - Keep the points concise but informative
          Query: ${userText}`;
      } else {
        // If only image is provided, add instruction for image analysis
        parts.unshift({
          text: `Please analyze this image and provide observations in the following format:
          - Each main point should be a separate, complete sentence
          - If there are related details, include them in the same sentence using appropriate connecting words
          - Do not use bullet points, markdown, or special formatting
          - Each point should be on a new line
          - Keep the points concise but informative`,
        });
      }

      const result = await model.generateContent({
        contents: [{ role: "user", parts: parts }],
      });

      const response = result.response;
      const text = response.text();

      // Process and clean up the response
      const points = text
        .split("\n")
        .filter((line) => line.trim())
        .map((point) => {
          // Remove markdown formatting and clean up the text
          return point
            .replace(/\*\*/g, "") // Remove bold
            .replace(/\*/g, "") // Remove italics
            .replace(/^[-•*]\s*/, "") // Remove bullet points
            .replace(/^#+\s*/, "") // Remove headers
            .replace(/\s+/g, " ") // Normalize spaces
            .trim();
        })
        .filter((point) => point && !point.match(/^[:#\-=]/)) // Remove separator lines and empty points
        .filter((point) => point.length > 10); // Remove very short lines that might be headers or incomplete points

      res.json({
        success: true,
        data: {
          points: points,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get response from Gemini API",
        details: error.message,
      });
    } finally {
      // Clean up the temporary uploaded image file
      if (imageFile && fs.existsSync(imageFile.path)) {
        fs.unlinkSync(imageFile.path);
        console.log(`Deleted temporary file: ${imageFile.path}`);
      }
    }
  }
);

// Add the routine routes
app.use("/api/v1/routine", routineRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    details: err.message,
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
