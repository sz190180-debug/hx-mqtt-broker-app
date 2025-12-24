import { create } from "zustand";

interface IProps {
  count: number;
  increment: () => void;
  decrement: () => void;
}

const useReqIdStore = create<IProps>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
}));

export default useReqIdStore;
