#include "timing.hpp"
#include <iostream>
#include <stdexcept>
#include <thread>
using namespace a1;
void require(bool ok,const char* message) { if(!ok) throw std::runtime_error(message); }
int main() {
    try {
        require(frameTime(123,60*60*60,60)==123+3600*second,"60 Hz must not accumulate rounding error");
        SampleClock clock; Tick first=100*second,last=0; double worstSteadyError=0;
        // Ten minutes: device 100 ppm slower than host; callbacks +/- 0.3 ms jitter.
        for(int i=0;i<112500;++i) {
            Tick actual=first+Tick(double(i)*256*second/48000*1.0001);
            Tick jitter=(i%3-1)*3000;
            Tick stamp=clock.stamp(actual+jitter,256,48000);
            require(i==0||stamp>last,"audio timestamps must be monotonic under drift and jitter");
            if(i>10000) worstSteadyError=std::max(worstSteadyError,std::abs(double(stamp-actual)));
            last=stamp;
        }
        require(worstSteadyError<2*ms,"clock drift must stay bounded over ten minutes");
        auto reset=clock.stamp(last+second,512,44100);
        require(reset==last+second && clock.resets>=2,"device reset/rate change must re-anchor");
        Ring<int,4> ring;
        for(int i=0;i<4;++i) { *ring.beginWrite()=i;ring.commitWrite(); }
        require(!ring.beginWrite(),"overflow must return immediately");
        for(int i=0;i<4;++i) { require(*ring.peek()==i,"overflow must not overwrite unread data");ring.pop(); }
        require(!ring.peek(),"empty queue");
        Ring<int,64> concurrent;
        std::thread producer([&]{for(int i=0;i<100000;++i){ int* p;while(!(p=concurrent.beginWrite())) std::this_thread::yield(); *p=i;concurrent.commitWrite();}});
        bool ordered=true;
        for(int i=0;i<100000;++i){const int* p;while(!(p=concurrent.peek()))std::this_thread::yield();if(*p!=i)ordered=false;concurrent.pop();}
        producer.join();require(ordered,"SPSC memory ordering");
        std::cout<<"PASS: long-running drift, jitter, discontinuities, 60 Hz rounding, bounded and concurrent queues\n";
        return 0;
    } catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}
