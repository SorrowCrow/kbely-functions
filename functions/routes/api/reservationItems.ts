import { Request, Response } from "express";
import { defineString } from "firebase-functions/params";
import Stripe from "stripe";
import ReservationItem from "../../models/ReservationItem";

import { Router } from "express";
import nodemailer = require("nodemailer");
import mongoose from "mongoose";

// eslint-disable-next-line
const router = Router();

router.get("/:date", async (req: Request, res: Response) => {
  await mongoose.connect(defineString("MONGO_URI").value());

  const { date } = req.params;
  try {
    const reservationItems = await ReservationItem.find(
      { date: date },
      { time: 1, _id: 0 }
    ).sort({ time: 1 });
    if (!reservationItems) throw new Error("No reservationItems");
    const sorted = reservationItems.sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    res.status(200).json(sorted);
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

function email(source: any) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Use `true` for port 465, `false` for all other ports
    auth: {
      user: defineString("VERIFIED_EMAIL").value(),
      pass: defineString("APP_PASSWORD").value(),
    },
  });

  const sendmail = async (mailDetails: any, callback: any) => {
    try {
      const info = await transporter.sendMail(mailDetails);
      callback(info);
    } catch (error) {
      console.log(error);
    }
  };

  const options = {
    from: "TESTING <forestmccallister@gmail.com>", // sender address
    to: "andrejsmatvejevs000@gmail.com", // receiver email
    subject: "Thank you for your reservation",
    text: "We have received your reservation",
    html: `<strong>Your reservation: </strong>
        <ul>
        <li>Date: ${source.date}</li>
        <li>Time: ${source.time}</li>
        <li>Persons: ${source.persons}</li>
        <li>Ozdoba: ${
          source.ozdoba === "true" ? "Included" : "Not Included"
        }</li>
        <li>Ovocna Misa: ${
          source.misa === "true" ? "Included" : "Not Included"
        }</li>
        <li>Prossecco: ${
          source.prossecco === "true" ? "Included" : "Not Included"
        }</li>
        </ul>`,
  };

  // send mail with defined transport object and mail options
  sendmail(options, (info: any) => {
    console.log("Email sent successfully");
    console.log("MESSAGE ID: ", info.messageId);
  });
}

router.post("/", async (req: Request, res: Response) => {
  await mongoose.connect(defineString("MONGO_URI").value());

  const stripe = new Stripe(defineString("SECRET_KEY").value() || "");

  const { stripeId } = req.body;
  let newreservationItem = undefined;
  let metadata;
  if (stripeId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(stripeId);
    metadata = paymentIntent.metadata;
    metadata.stripeId = stripeId;
    newreservationItem = new ReservationItem(metadata);
  } else {
    const { captchaRes } = req.body;
    const response = await (
      await fetch(
        `https://www.google.com/recaptcha/api/siteverify?secret=${defineString(
          "CAPTCHA_SECRET"
        ).value()}&response=${captchaRes}`
      )
    ).json();
    console.log(response);

    const { time, date } = req.body.cleanData;
    if (response.success === true) {
      const reservationItems = await ReservationItem.find(
        { date: date },
        { time: 1, _id: 0 }
      ).sort({ time: 1 });
      if (!reservationItems) throw new Error("No reservationItems");
      const sorted = reservationItems.sort((a, b) => {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
      for (let i = 0; i < Object.keys(sorted).length; i++) {
        if (time === sorted[i].time) throw new Error("Time taken");
      }
      if (typeof req.body.cleanData.time === "object") {
        console.log(req.body.cleanData.time);
        req.body.cleanData.time = req.body.cleanData.time[0];
        console.log(req.body.cleanData.time);
      }
      newreservationItem = new ReservationItem(req.body.cleanData);
    }
  }

  if (!newreservationItem) throw new Error("No reservation item");

  const isReservationItem = await newreservationItem.save();

  if (!isReservationItem) {
    throw new Error("Something went wrong while saving form");
  }

  res.status(200).json();

  if (stripeId) {
    email(metadata);
  } else {
    email(req.body.cleanData);
  }
});

export default router;
