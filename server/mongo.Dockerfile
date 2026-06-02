FROM mongo:6.0

# Use the official MongoDB image. Data will be stored in /data/db
VOLUME /data/db
EXPOSE 27017

CMD ["mongod"]
