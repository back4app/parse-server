"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KeyPromiseQueue = void 0;

// KeyPromiseQueue is a simple promise queue
// used to queue operations per key basis.
// Once the tail promise in the key-queue fulfills,
// the chain on that key will be cleared.
class KeyPromiseQueue {
  constructor() {
    this.queue = {};
  }

  enqueue(key, operation) {
    const tuple = this.beforeOp(key);
    const toAwait = tuple[1];
    const nextOperation = toAwait.then(operation);
    const wrappedOperation = nextOperation.then(result => {
      this.afterOp(key);
      return result;
    });
    tuple[1] = wrappedOperation;
    return wrappedOperation;
  }

  beforeOp(key) {
    let tuple = this.queue[key];

    if (!tuple) {
      tuple = [0, Promise.resolve()];
      this.queue[key] = tuple;
    }

    tuple[0]++;
    return tuple;
  }

  afterOp(key) {
    const tuple = this.queue[key];

    if (!tuple) {
      return;
    }

    tuple[0]--;

    if (tuple[0] <= 0) {
      delete this.queue[key];
      return;
    }
  }

}

exports.KeyPromiseQueue = KeyPromiseQueue;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJLZXlQcm9taXNlUXVldWUiLCJjb25zdHJ1Y3RvciIsInF1ZXVlIiwiZW5xdWV1ZSIsImtleSIsIm9wZXJhdGlvbiIsInR1cGxlIiwiYmVmb3JlT3AiLCJ0b0F3YWl0IiwibmV4dE9wZXJhdGlvbiIsInRoZW4iLCJ3cmFwcGVkT3BlcmF0aW9uIiwicmVzdWx0IiwiYWZ0ZXJPcCIsIlByb21pc2UiLCJyZXNvbHZlIl0sInNvdXJjZXMiOlsiLi4vc3JjL0tleVByb21pc2VRdWV1ZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBLZXlQcm9taXNlUXVldWUgaXMgYSBzaW1wbGUgcHJvbWlzZSBxdWV1ZVxuLy8gdXNlZCB0byBxdWV1ZSBvcGVyYXRpb25zIHBlciBrZXkgYmFzaXMuXG4vLyBPbmNlIHRoZSB0YWlsIHByb21pc2UgaW4gdGhlIGtleS1xdWV1ZSBmdWxmaWxscyxcbi8vIHRoZSBjaGFpbiBvbiB0aGF0IGtleSB3aWxsIGJlIGNsZWFyZWQuXG5leHBvcnQgY2xhc3MgS2V5UHJvbWlzZVF1ZXVlIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5xdWV1ZSA9IHt9O1xuICB9XG5cbiAgZW5xdWV1ZShrZXksIG9wZXJhdGlvbikge1xuICAgIGNvbnN0IHR1cGxlID0gdGhpcy5iZWZvcmVPcChrZXkpO1xuICAgIGNvbnN0IHRvQXdhaXQgPSB0dXBsZVsxXTtcbiAgICBjb25zdCBuZXh0T3BlcmF0aW9uID0gdG9Bd2FpdC50aGVuKG9wZXJhdGlvbik7XG4gICAgY29uc3Qgd3JhcHBlZE9wZXJhdGlvbiA9IG5leHRPcGVyYXRpb24udGhlbihyZXN1bHQgPT4ge1xuICAgICAgdGhpcy5hZnRlck9wKGtleSk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0pO1xuICAgIHR1cGxlWzFdID0gd3JhcHBlZE9wZXJhdGlvbjtcbiAgICByZXR1cm4gd3JhcHBlZE9wZXJhdGlvbjtcbiAgfVxuXG4gIGJlZm9yZU9wKGtleSkge1xuICAgIGxldCB0dXBsZSA9IHRoaXMucXVldWVba2V5XTtcbiAgICBpZiAoIXR1cGxlKSB7XG4gICAgICB0dXBsZSA9IFswLCBQcm9taXNlLnJlc29sdmUoKV07XG4gICAgICB0aGlzLnF1ZXVlW2tleV0gPSB0dXBsZTtcbiAgICB9XG4gICAgdHVwbGVbMF0rKztcbiAgICByZXR1cm4gdHVwbGU7XG4gIH1cblxuICBhZnRlck9wKGtleSkge1xuICAgIGNvbnN0IHR1cGxlID0gdGhpcy5xdWV1ZVtrZXldO1xuICAgIGlmICghdHVwbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdHVwbGVbMF0tLTtcbiAgICBpZiAodHVwbGVbMF0gPD0gMCkge1xuICAgICAgZGVsZXRlIHRoaXMucXVldWVba2V5XTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTUEsZUFBTixDQUFzQjtFQUMzQkMsV0FBVyxHQUFHO0lBQ1osS0FBS0MsS0FBTCxHQUFhLEVBQWI7RUFDRDs7RUFFREMsT0FBTyxDQUFDQyxHQUFELEVBQU1DLFNBQU4sRUFBaUI7SUFDdEIsTUFBTUMsS0FBSyxHQUFHLEtBQUtDLFFBQUwsQ0FBY0gsR0FBZCxDQUFkO0lBQ0EsTUFBTUksT0FBTyxHQUFHRixLQUFLLENBQUMsQ0FBRCxDQUFyQjtJQUNBLE1BQU1HLGFBQWEsR0FBR0QsT0FBTyxDQUFDRSxJQUFSLENBQWFMLFNBQWIsQ0FBdEI7SUFDQSxNQUFNTSxnQkFBZ0IsR0FBR0YsYUFBYSxDQUFDQyxJQUFkLENBQW1CRSxNQUFNLElBQUk7TUFDcEQsS0FBS0MsT0FBTCxDQUFhVCxHQUFiO01BQ0EsT0FBT1EsTUFBUDtJQUNELENBSHdCLENBQXpCO0lBSUFOLEtBQUssQ0FBQyxDQUFELENBQUwsR0FBV0ssZ0JBQVg7SUFDQSxPQUFPQSxnQkFBUDtFQUNEOztFQUVESixRQUFRLENBQUNILEdBQUQsRUFBTTtJQUNaLElBQUlFLEtBQUssR0FBRyxLQUFLSixLQUFMLENBQVdFLEdBQVgsQ0FBWjs7SUFDQSxJQUFJLENBQUNFLEtBQUwsRUFBWTtNQUNWQSxLQUFLLEdBQUcsQ0FBQyxDQUFELEVBQUlRLE9BQU8sQ0FBQ0MsT0FBUixFQUFKLENBQVI7TUFDQSxLQUFLYixLQUFMLENBQVdFLEdBQVgsSUFBa0JFLEtBQWxCO0lBQ0Q7O0lBQ0RBLEtBQUssQ0FBQyxDQUFELENBQUw7SUFDQSxPQUFPQSxLQUFQO0VBQ0Q7O0VBRURPLE9BQU8sQ0FBQ1QsR0FBRCxFQUFNO0lBQ1gsTUFBTUUsS0FBSyxHQUFHLEtBQUtKLEtBQUwsQ0FBV0UsR0FBWCxDQUFkOztJQUNBLElBQUksQ0FBQ0UsS0FBTCxFQUFZO01BQ1Y7SUFDRDs7SUFDREEsS0FBSyxDQUFDLENBQUQsQ0FBTDs7SUFDQSxJQUFJQSxLQUFLLENBQUMsQ0FBRCxDQUFMLElBQVksQ0FBaEIsRUFBbUI7TUFDakIsT0FBTyxLQUFLSixLQUFMLENBQVdFLEdBQVgsQ0FBUDtNQUNBO0lBQ0Q7RUFDRjs7QUFyQzBCIn0=