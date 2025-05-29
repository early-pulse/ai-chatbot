# Medical Chatbot Service

A Node.js backend service that provides a medical chatbot interface using Google's Gemini AI. The service can handle both text queries and image analysis.

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following content:
```
GEMINI_API_KEY=your_api_key_here
PORT=3000
```

4. Get your Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

5. Start the server:
```bash
npm start
```

## API Endpoints

### 1. Text-only Chat
- **Endpoint:** `POST /api/chat`
- **Content-Type:** `application/json`
- **Request Body:**
```json
{
    "message": "What are the symptoms of diabetes?"
}
```

### 2. Image Analysis Chat
- **Endpoint:** `POST /api/chat-with-image`
- **Content-Type:** `multipart/form-data`
- **Request Body:**
  - `image`: Image file (max 5MB)
  - `message`: Optional text message/question about the image

## Response Format

All responses follow this JSON structure:
```json
{
    "success": true,
    "data": {
        "points": [
            "Point 1",
            "Point 2",
            "..."
        ],
        "timestamp": "2024-01-01T12:00:00.000Z"
    }
}
```

## Error Response
```json
{
    "success": false,
    "error": "Error message",
    "details": "Detailed error information"
}
```

## Postman Testing Guide

1. **For Text-only Queries:**
   - Create a new POST request to `http://localhost:3000/api/chat`
   - Set Content-Type header to `application/json`
   - In the request body (raw/JSON), enter:
   ```json
   {
       "message": "Your medical question here"
   }
   ```

2. **For Image Analysis:**
   - Create a new POST request to `http://localhost:3000/api/chat-with-image`
   - Use form-data in the request body
   - Add a file field named `image` and upload your medical image
   - Add a text field named `message` (optional) with your question about the image

## Notes
- Maximum image size: 5MB
- Supported image formats: JPEG, PNG
- The service uses Gemini Pro for text and Gemini Pro Vision for images 