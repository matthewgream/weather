
#ifndef __PROGRAM_HPP__
#define __PROGRAM_HPP__

// -----------------------------------------------------------------------------------------------

class Program {
    public:
        Program (const Variables &conf): _conf (conf) {}
        long exec (Inkplate &view);
    protected:
        bool load (const Variables &conf, Variables &vars);
        bool show (const Variables &conf, const Variables &vars, Inkplate &view) const;
    private:
        const Variables &_conf;
};

// -----------------------------------------------------------------------------------------------

#endif
