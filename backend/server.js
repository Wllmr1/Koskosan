require("dotenv").config();

const express = require("express");
const cors = require("cors");

const chatRoutes = require("./routes/chat");
const webhookRoutes = require("./routes/webhook");

const app = express();

app.use(cors());
app.use(express.json());

app.use(chatRoutes);
app.use(webhookRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
