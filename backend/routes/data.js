const express = require("express");
const router = express.Router();
const { getAllPosts } = require("../data/fetchall");

router.get("/posts", getAllPosts);

module.exports = router;
