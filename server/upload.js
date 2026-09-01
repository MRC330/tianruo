const path = require('path');
const multer = require('multer');
const express = require('express');
const config = require('./config');
const { db, q, saveSoon, uid } = require('./store');
const { avatarSvg } = require('./avatar');

const router = express.Router();
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 6) || '.jpg';
    cb(null, Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 } });

/** 统一上传入口：字段 file，返回可访问 url */
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ ok: false, msg: '没有选择文件' });
  const url = '/uploads/' + req.file.filename;
  res.json({ ok: true, url, type: req.file.mimetype, size: req.file.size });
});

router.post('/multi', upload.array('files', 9), (req, res) => {
  const urls = (req.files || []).map((f) => '/uploads/' + f.filename);
  res.json({ ok: true, urls });
});

module.exports = { router, upload, storage };
