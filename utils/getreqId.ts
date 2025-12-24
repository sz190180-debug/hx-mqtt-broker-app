import storage from "@/store";

export const getReqId = async () => {
  console.log("getReqId");

  const reqId = await storage.load({
    key: "reqId",
  });

  if (!reqId) {
    const reqId = await storage.save({
      key: "reqId",
      data: 0,
    });
    return Number(reqId) + 1;
  } else {
    return Number(reqId) + 1;
  }
};
