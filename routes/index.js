const express = require('express');
const router = express.Router();
const pdflib = require('pdf-lib');
const fetch = require("node-fetch");
const fs = require('fs');
const QRCode = require('qrcode');

function generateQR(text) {
  const opts = {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    quality: 0.92,
    margin: 1,
  };
  return QRCode.toDataURL(text, opts)
}

function getIdealFontSize (font, text, maxWidth, minSize, defaultSize) {
  let currentSize = defaultSize;
  let textWidth = font.widthOfTextAtSize(text, defaultSize);

  while (textWidth > maxWidth && currentSize > minSize) {
    textWidth = font.widthOfTextAtSize(text, --currentSize)
  }

  return textWidth > maxWidth ? null : currentSize
}


async function createDocument(profile) {
  const timestamp = Date.now();
  const creationInstant = new Date();
  const creationDate = creationInstant.toLocaleDateString('fr-FR');
  const creationHour = creationInstant
      .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      .replace(':', 'h');
  const data = [
    `Cree le: ${creationDate} à ${creationHour}`,
    `Nom: ${profile.lastname}`,
    `Prenom: ${profile.firstname}`,
    `Naissance: ${profile.birthday} à ${profile.place_of_birth}`,
    `Adresse: ${profile.address} ${profile.zip} ${profile.city}`,
    `Sortie: ${creationDate} à ${creationHour}`,
    `Motifs: ${profile.reason}`,
  ].join(';\n ');

  console.log(data);
  const existingPdfBytes = await fetch("http://localhost:3000/pdf/certificate.pdf").then(res => res.arrayBuffer());
  const pdfDoc = await pdflib.PDFDocument.load(existingPdfBytes);

  const page1 = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(pdflib.StandardFonts.Helvetica);
  let locationSize = getIdealFontSize(font, profile.city, 83, 7, 11);

  const ys = {
    travail: 572,
    achats: 523,
    sante: 475,
    famille: 438,
    handicap: 402,
    sport_animaux: 378,
    convocation: 293,
    missions: 256,
    enfants: 232,
  };

  const drawText = (text, x, y, size = 11) => {
    page1.drawText(text, { x, y, size, font, color: pdflib.rgb(0.3, 0.3, 0.4) })
  };

  const generatedQR = await generateQR(data);
  const qrImage = await pdfDoc.embedPng(generatedQR);

  pdfDoc.setTitle('COVID-19 - Déclaration de déplacement');
  pdfDoc.setSubject('Attestation de déplacement dérogatoire');
  pdfDoc.setKeywords([
    'covid19',
    'covid-19',
    'attestation',
    'déclaration',
    'déplacement',
    'officielle',
    'gouvernement',
  ]);
  pdfDoc.setProducer('DNUM/SDIT');
  pdfDoc.setCreator('');
  pdfDoc.setAuthor("Ministère de l'intérieur");

  drawText(`${profile.firstname} ${profile.lastname}`, 119, 688);
  drawText(profile.birthday, 120, 670);
  drawText(profile.place_of_birth, 265, 670);
  drawText(`${profile.address} ${profile.zip} ${profile.city}`, 133, 652);

  profile.reason
      .split(', ')
      .forEach(reason => {
        drawText('x', 73, ys[profile.reason], 18)
      });

  drawText(profile.city, 110, 196, locationSize);
  drawText(`${creationDate}`, 95, 178, 11);
  drawText(`${creationHour}`, 285, 178, 11);

  drawText(`${profile.firstname} ${profile.lastname}`, 150, 130, 20);

  page1.drawImage(qrImage, {
    x: page1.getWidth() - 215,
    y: 100,
    width: 92,
    height: 92,
  });

  pdfDoc.addPage();

  const page2 = pdfDoc.getPages()[1];
  page2.drawImage(qrImage, {
    x: 50,
    y: page2.getHeight() - 350,
    width: 300,
    height: 300,
  });


  fs.writeFileSync('./public/pdf/tmp_' + timestamp + '.pdf', await pdfDoc.save());
  return {
    path: './public/pdf/tmp_' + timestamp + '.pdf',
    file: fs.readFileSync('./public/pdf/tmp_' + timestamp + '.pdf'),
  };
}

router.get('/', async function(req, res, next) {
  /*const data = await createDocument({
    lastname: req.query.lastname,
    firstname: 'Riot',
    birthday: '02/01/1999',
    place_of_birth: 'Rennes',
    address: '4 Allée Christine de Pisan',
    zip: '44470',
    city: 'Carquefou',
    reason: 'enfants',
  });*/

  const data = await createDocument(req.query);
  res.contentType("application/pdf");
  res.send(data.file);
  await fs.unlinkSync(data.path);
});

module.exports = router;
