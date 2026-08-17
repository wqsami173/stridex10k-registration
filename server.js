const express = require("express");
const multer = require("multer");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 5000;

// ==================================================
// BASIC SETUP
// ==================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(__dirname));

// ==================================================
// UPLOAD FOLDER
// ==================================================

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// ==================================================
// MULTER - STUDENT ID UPLOAD
// ==================================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname);

        const filename =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1000000) +
            extension;

        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "application/pdf"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPG, PNG and PDF files are allowed."));
        }
    }
});

// ==================================================
// DATABASE
// ==================================================

const db = new Database("stridex.db");

db.prepare(`
    CREATE TABLE IF NOT EXISTS registrations (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        registration_id TEXT UNIQUE NOT NULL,

        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,

        category TEXT NOT NULL,
        gender TEXT NOT NULL,

        events TEXT NOT NULL,

        total_amount INTEGER NOT NULL,

        payment_method TEXT NOT NULL,
        personal_number TEXT NOT NULL,
        transaction_id TEXT NOT NULL,

        student_id_file TEXT,

        status TEXT DEFAULT 'pending',

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();


// ==================================================
// TEST API
// ==================================================

app.get("/api/test", (req, res) => {

    res.json({
        success: true,
        message: "StrideX backend is working!"
    });

});


// ==================================================
// REGISTRATION API
// ==================================================

app.post(
    "/api/register",
    upload.single("studentId"),
    (req, res) => {

        try {

            const {
                fullName,
                email,
                phone,
                category,
                gender,
                events,
                paymentMethod,
                personalNumber,
                transactionId
            } = req.body;


            // ------------------------------------------
            // BASIC VALIDATION
            // ------------------------------------------

            if (
                !fullName ||
                !email ||
                !phone ||
                !category ||
                !gender ||
                !events ||
                !paymentMethod ||
                !personalNumber ||
                !transactionId
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Please fill all required fields."
                });

            }


            // ------------------------------------------
            // VALID CATEGORY
            // ------------------------------------------

            if (
                category !== "student" &&
                category !== "regular"
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid category."
                });

            }


            // ------------------------------------------
            // VALID GENDER
            // ------------------------------------------

            if (
                gender !== "male" &&
                gender !== "female"
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid gender."
                });

            }


            // ------------------------------------------
            // EVENTS
            // ------------------------------------------

            let selectedEvents;

            try {

                selectedEvents = JSON.parse(events);

            } catch {

                return res.status(400).json({
                    success: false,
                    message: "Invalid event data."
                });

            }


            if (
                !Array.isArray(selectedEvents) ||
                selectedEvents.length === 0
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Please select at least one event."
                });

            }


            const allowedEvents = ["event1", "event2"];

            const validEvents =
                selectedEvents.every(event =>
                    allowedEvents.includes(event)
                );

            if (!validEvents) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid event selected."
                });

            }


            // ------------------------------------------
            // PRICE CALCULATION
            // ------------------------------------------

            const prices = {

                student: {
                    event1: 649,
                    event2: 599,
                    both: 1199
                },

                regular: {
                    event1: 699,
                    event2: 599,
                    both: 1249
                }

            };


            let totalAmount = 0;


            if (
                selectedEvents.includes("event1") &&
                selectedEvents.includes("event2")
            ) {

                totalAmount = prices[category].both;

            }

            else if (selectedEvents.includes("event1")) {

                totalAmount = prices[category].event1;

            }

            else if (selectedEvents.includes("event2")) {

                totalAmount = prices[category].event2;

            }


            // ------------------------------------------
            // STUDENT ID
            // ------------------------------------------

            if (
                category === "student" &&
                !req.file
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Student ID card is required."
                });

            }


            // ------------------------------------------
            // REGISTRATION ID
            // ------------------------------------------

            const registrationId =
                "SX10K-" +
                Date.now().toString().slice(-8);


            // ------------------------------------------
            // SAVE TO DATABASE
            // ------------------------------------------

            const statement = db.prepare(`

                INSERT INTO registrations (

                    registration_id,

                    full_name,
                    email,
                    phone,

                    category,
                    gender,

                    events,

                    total_amount,

                    payment_method,
                    personal_number,
                    transaction_id,

                    student_id_file

                )

                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

            `);


            statement.run(

                registrationId,

                fullName.trim(),
                email.trim(),
                phone.trim(),

                category,
                gender,

                JSON.stringify(selectedEvents),

                totalAmount,

                paymentMethod,
                personalNumber.trim(),
                transactionId.trim(),

                req.file
                    ? req.file.filename
                    : null

            );


            // ------------------------------------------
            // SUCCESS
            // ------------------------------------------

            console.log(
                `New registration: ${registrationId}`
            );


            res.json({

                success: true,

                message: "Registration successful!",

                registrationId: registrationId,

                amount: totalAmount,

                status: "pending"

            });


        }

        catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message: "Server error. Please try again."

            });

        }

    }
);


// ==================================================
// ERROR HANDLER
// ==================================================

app.use((error, req, res, next) => {

    console.error(error);

    if (error instanceof multer.MulterError) {

        if (error.code === "LIMIT_FILE_SIZE") {

            return res.status(400).json({
                success: false,
                message: "Student ID file must be less than 5MB."
            });

        }

    }

    res.status(400).json({
        success: false,
        message: error.message || "Something went wrong."
    });

});


// ==================================================
// START SERVER
// ==================================================

app.listen(PORT, () => {

    console.log("");
    console.log("======================================");
    console.log("      STRIDEX 10K BACKEND");
    console.log("======================================");
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Test:   http://localhost:${PORT}/api/test`);
    console.log("======================================");
    console.log("");

});