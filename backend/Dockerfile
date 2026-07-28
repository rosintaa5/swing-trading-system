# Gunakan image Node.js versi 18 yang ringan (Alpine)
FROM node:18-alpine

# Buat direktori kerja di dalam container
WORKDIR /usr/src/app

# Salin package.json dan package-lock.json terlebih dahulu
COPY package*.json ./

# Instal semua dependency bot (axios, pg, socket.io, cors, express, dll)
RUN npm install

# Salin seluruh file kode backend Anda ke dalam container
COPY . .

# Beri tahu container bahwa bot berjalan di port 3000
EXPOSE 3000

# Perintah utama untuk menyalakan bot secara abadi
CMD [ "node", "server.js" ]
