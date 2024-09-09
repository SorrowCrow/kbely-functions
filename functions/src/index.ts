/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import reservationItem from "../models/reservationItem";
import Stripe from "stripe";
import mongoose from "mongoose";
import { Request, Response } from "express";
import express = require("express");
import { defineString } from "firebase-functions/params";
import reservationItemRoutes from "../routes/api/reservationItems";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", { structuredData: true });
//   response.send("Hello from Firebase!");
// });
const app = express();
app.use(express.json());

app.post("/stripe", async (req: Request, res: Response) => {
  await mongoose.connect(defineString("MONGO_URI").value());

  const stripe = new Stripe(defineString("SECRET_KEY").value());

  const formData = req.body.cleanData;

  try {
    const { time, misa, ozdoba, prossecco, persons, date } = formData;
    const reservationItems = await reservationItem
      .find({ date: date }, { time: 1, _id: 0 })
      .sort({ time: 1 });
    if (!reservationItems) throw new Error("No reservationItems");
    const sorted = reservationItems.sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    for (let i = 0; i < Object.keys(sorted).length; i++) {
      if (time === sorted[i].time) throw new Error("time taken");
    }

    let amount = persons * 100;
    if (ozdoba) amount += 350;
    if (prossecco) amount += 290;
    if (misa) amount += 350;
    let reservedArray = [
      time.slice("", time.indexOf(":")),
      time.slice(time.indexOf(":") + 1, time.indexOf("-")),
      time.slice(time.indexOf("-") + 1).slice("", time.indexOf(":")),
      time.slice(time.indexOf("-") + 1).slice(time.indexOf(":") + 1),
    ];
    const intTime =
      Number(reservedArray[2]) -
      Number(reservedArray[0]) +
      (Number(reservedArray[3]) === 30 ? 0.5 : 0);

    if (intTime === 1) amount += 799;
    else if (intTime === 1.5) amount += 1099;
    else if (intTime === 2) amount += 1399;
    else if (intTime === 3) amount += 1899;

    amount = amount * 100;

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "czk",
        metadata: formData,
      });

      res.status(200).send({
        client_secret: paymentIntent.client_secret,
        id: paymentIntent.id,
      });
    } catch (error) {
      logger.error("error: " + error);
      res.status(200).send({ message: error });
    }
  } catch (error) {
    res.status(200).send({ message: (error as Error).message });
    return;
  }
  // } else {
  //     console.log("captcha not successful");
  //     res.status(200).send({ message: "captcha not successful" });
  // }
});

app.use("/reservationItems", reservationItemRoutes);

exports.api = onRequest(app);
