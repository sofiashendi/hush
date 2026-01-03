import '../index.css';

const Waveform = () => (
    <div className="waveform">
        {[...Array(5)].map((_, i) => (
            <div key={i} className="bar" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
    </div>
);

export default Waveform;
